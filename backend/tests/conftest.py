import os
import tempfile

# Настройки читаются при импорте приложения, поэтому окружение задаётся до любых импортов app.*
os.environ["DATABASE_URL"] = os.environ.get("TEST_DATABASE_URL", "postgresql+psycopg://zayavki:zayavki@localhost:5432/zayavki_test")
os.environ["ENVIRONMENT"] = "test"
os.environ["AUTH_MODE"] = "dev"
os.environ["TIMEZONE"] = "Europe/Moscow"
os.environ["UPLOAD_DIR"] = tempfile.mkdtemp(prefix="zayavki-uploads-")

from copy import deepcopy
from datetime import date, datetime, time, timezone
from pathlib import Path

import pytest
from alembic import command
from alembic.config import Config
from fastapi.testclient import TestClient
from sqlalchemy import text

from app import timeutil
from app.db import engine
from app.main import app

BACKEND_DIR = Path(__file__).resolve().parents[1]
TODAY = date(2026, 9, 14)  # понедельник

REGION_HEAD_OFFICE = 1
TOPIC_ECONOMY = 3
TOPIC_OTHER = 11


@pytest.fixture(scope="session", autouse=True)
def migrated_database():
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    # Схема пересоздаётся с нуля: база могла остаться заполненной после прерванного запуска.
    with engine.begin() as connection:
        connection.execute(text("DROP SCHEMA public CASCADE; CREATE SCHEMA public;"))
    command.upgrade(config, "head")
    yield


@pytest.fixture(autouse=True)
def clean_database(migrated_database):
    with engine.begin() as connection:
        connection.execute(
            text("TRUNCATE notifications, request_events, request_documents, drafts, requests, request_counters, users RESTART IDENTITY CASCADE")
        )
    yield


@pytest.fixture(autouse=True)
def freeze(monkeypatch):
    """Замораживает «сегодня» в часовом поясе организации. По умолчанию — понедельник 14.09.2026."""

    def set_today(day: date, hour_utc: int = 9) -> None:
        moment = datetime.combine(day, time(hour_utc), tzinfo=timezone.utc)
        monkeypatch.setattr(timeutil, "utcnow", lambda: moment)
        monkeypatch.setattr(timeutil, "local_now", lambda: moment)
        monkeypatch.setattr(timeutil, "local_today", lambda: day)

    set_today(TODAY)
    return set_today


class Api:
    def __init__(self, client: TestClient, login: str):
        self.client = client
        self.login = login

    def headers(self, extra: dict | None = None) -> dict:
        return {"X-Dev-User": self.login, "X-Requested-With": "zayavki", **(extra or {})}

    def get(self, url: str, **kwargs):
        return self.client.get(url, headers=self.headers(kwargs.pop("headers", None)), **kwargs)

    def post(self, url: str, **kwargs):
        return self.client.post(url, headers=self.headers(kwargs.pop("headers", None)), **kwargs)

    def put(self, url: str, **kwargs):
        return self.client.put(url, headers=self.headers(kwargs.pop("headers", None)), **kwargs)

    def delete(self, url: str, **kwargs):
        return self.client.delete(url, headers=self.headers(kwargs.pop("headers", None)), **kwargs)


@pytest.fixture
def client():
    with TestClient(app) as test_client:
        yield test_client


@pytest.fixture
def as_user(client):
    return lambda login: Api(client, login)


@pytest.fixture
def applicant(as_user) -> Api:
    return as_user("o.smirnova")


@pytest.fixture
def other_applicant(as_user) -> Api:
    return as_user("d.kovalev")


@pytest.fixture
def admin(as_user) -> Api:
    api = as_user("s.orlov")
    # Администратор должен хотя бы раз зайти в систему, чтобы получать уведомления.
    assert api.get("/api/me").status_code == 200
    return api


def _merge(base: dict, overrides: dict) -> dict:
    for key, value in overrides.items():
        if isinstance(value, dict) and isinstance(base.get(key), dict):
            _merge(base[key], value)
        else:
            base[key] = value
    return base


BASE_PAYLOAD = {
    "applicant": {"phone": "+7 912 345-67-89", "department": "Отдел экономики и планирования", "region_id": REGION_HEAD_OFFICE},
    "type": "new",
    "existing_system_name": None,
    "topic_id": TOPIC_ECONOMY,
    "topic_other": None,
    "process": "Экономист вручную собирает данные из пяти отчётов Excel и сводит их в единую таблицу.",
    "problem": "Сведение занимает много времени, при копировании возникают ошибки.",
    "desired_result": "Система сама собирает отчёты подразделений и формирует сводную таблицу.",
    "method_suggestion": None,
    "beneficiaries": "Отдел экономики и планирования, финансовый департамент",
    "result_recipient": "Начальник отдела экономики и планирования",
    "workload": {"frequency": "month", "duration": "3", "duration_unit": "hours", "times_per_period": 1, "employees_count": 1, "note": None},
    "documents": [],
    "consent": True,
}


def payload(**overrides) -> dict:
    return _merge(deepcopy(BASE_PAYLOAD), overrides)


def create_request(api: Api, **overrides) -> dict:
    response = api.post("/api/requests", json=payload(**overrides))
    assert response.status_code == 201, response.text
    return response.json()


def errors_by_path(response) -> dict[str, str]:
    return {error["path"]: error["message"] for error in response.json()["errors"]}
