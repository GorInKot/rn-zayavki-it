"""Доменные правила без HTTP: календарь, телефон, трудоёмкость, нумерация."""

import threading
from datetime import date
from decimal import Decimal

import pytest
from sqlalchemy import text
from sqlalchemy.exc import IntegrityError

from app.db import SessionLocal, engine
from app.enums import DurationUnit, Frequency
from app.services.calendar import BusinessCalendar
from app.services.numbering import next_request_number
from app.services.phone import normalize_phone
from app.services.workload import hours_per_month


@pytest.fixture
def calendar() -> BusinessCalendar:
    with SessionLocal() as db:
        return BusinessCalendar.load(db)


def test_review_deadline_skips_new_year_holidays(calendar):
    # Аудит Л-6: срок заявки от 29 декабря не должен выпадать на каникулы.
    assert calendar.add_business_days(date(2025, 12, 29), 5) == date(2026, 1, 15)


def test_transfers_and_working_saturdays(calendar):
    assert calendar.is_working(date(2025, 11, 1))  # рабочая суббота
    assert not calendar.is_working(date(2025, 11, 3))  # перенос с 1 ноября
    assert not calendar.is_working(date(2026, 1, 9))  # перенос с 3 января
    assert not calendar.is_working(date(2026, 2, 23))
    assert calendar.is_working(date(2026, 2, 24))


def test_unfilled_year_still_respects_statutory_holidays(calendar):
    assert not calendar.is_filled(2030)
    assert date(2030, 5, 9).weekday() < 5
    assert not calendar.is_working(date(2030, 5, 9))
    assert calendar.is_working(date(2030, 5, 8))


def test_business_days_between_is_signed(calendar):
    assert calendar.business_days_between(date(2026, 9, 18), date(2026, 9, 21)) == 1
    assert calendar.business_days_between(date(2026, 9, 21), date(2026, 9, 18)) == -1
    assert calendar.business_days_between(date(2026, 9, 21), date(2026, 9, 21)) == 0


@pytest.mark.parametrize(
    ("raw", "expected"),
    [
        ("+7 912 345-67-89", "+7 (912) 345-67-89"),
        ("89123456789", "+7 (912) 345-67-89"),
        ("+7 912 345-67-89 доб. 1234", "+7 (912) 345-67-89 доб. 1234"),
        ("(912) 345 67 89 ext 12", "+7 (912) 345-67-89 доб. 12"),
        ("1234", "внутр. 1234"),
    ],
)
def test_phone_accepts_real_corporate_formats(raw, expected):
    # Аудит Л-13: формат с добавочным номером раньше отклонялся.
    assert normalize_phone(raw) == expected


@pytest.mark.parametrize("raw", ["0000000000", "7777777777", "+7 912 3456789012345", "12", "звоните в отдел", ""])
def test_phone_rejects_garbage(raw):
    with pytest.raises(ValueError):
        normalize_phone(raw)


def test_short_operations_are_not_rounded_to_zero():
    # Аудит Л-2: 2 минуты раньше превращались в «0 чел.-часов».
    assert hours_per_month(Frequency.day, Decimal("2"), DurationUnit.minutes, 1, 1) == Decimal("0.70")


def test_workload_is_normalised_to_month():
    assert hours_per_month(Frequency.week, Decimal("1.5"), DurationUnit.hours, 2, 3) == Decimal("39.00")
    assert hours_per_month(Frequency.year, Decimal("2"), DurationUnit.days, 1, 1) == Decimal("1.33")
    assert hours_per_month(Frequency.irregular, Decimal("2"), DurationUnit.hours, 1, 1) is None
    assert hours_per_month(Frequency.month, None, DurationUnit.hours, 1, 1) is None


def test_request_numbers_are_unique_under_concurrency():
    # Аудит АР-3: номер выдаётся базой атомарно, одновременные заявки не получают одинаковый номер.
    numbers: list[str] = []
    lock = threading.Lock()
    start = threading.Barrier(20)

    def worker():
        with SessionLocal() as db:
            start.wait()
            number = next_request_number(db, 2026)
            db.commit()
        with lock:
            numbers.append(number)

    threads = [threading.Thread(target=worker) for _ in range(20)]
    for thread in threads:
        thread.start()
    for thread in threads:
        thread.join()

    assert sorted(numbers) == [f"AUT-2026-{i:06d}" for i in range(1, 21)]


def test_database_rejects_unknown_status(applicant):
    # Аудит Д-9: неизвестный статус не может попасть в базу и уронить интерфейс.
    from tests.conftest import create_request

    create_request(applicant)
    with pytest.raises(IntegrityError):
        with engine.begin() as connection:
            connection.execute(text("UPDATE requests SET status = 'on_hold'"))


def test_migrations_roundtrip_on_empty_database():
    from alembic import command
    from alembic.config import Config

    from tests.conftest import BACKEND_DIR

    with engine.begin() as connection:
        connection.execute(text("TRUNCATE notifications, request_events, request_documents, drafts, requests, request_counters, users RESTART IDENTITY CASCADE"))
    config = Config(str(BACKEND_DIR / "alembic.ini"))
    config.set_main_option("script_location", str(BACKEND_DIR / "alembic"))
    command.downgrade(config, "base")
    command.upgrade(config, "head")
    with SessionLocal() as db:
        assert BusinessCalendar.load(db).is_filled(2026)
