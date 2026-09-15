"""Режимы определения пользователя, которые будут работать за порталом."""

from datetime import datetime, timedelta, timezone
from urllib.parse import quote

import jwt
import pytest
from starlette.requests import Request

from app.auth import identity_from_headers, identity_from_jwt, is_admin_by_groups
from app.config import get_settings
from app.errors import AppError


def http_request(headers: dict[str, str], client_ip: str = "10.0.0.5", cookies: str | None = None) -> Request:
    raw = [(name.lower().encode("latin-1"), value.encode("latin-1")) for name, value in headers.items()]
    if cookies:
        raw.append((b"cookie", cookies.encode("latin-1")))
    return Request({"type": "http", "method": "GET", "path": "/api/me", "headers": raw, "client": (client_ip, 50000), "query_string": b""})


@pytest.fixture
def settings(monkeypatch):
    current = get_settings()
    monkeypatch.setattr(current, "trusted_proxies", "10.0.0.0/8")
    monkeypatch.setattr(current, "admin_groups", "ИТ-Автоматизация-Администраторы")
    return current


def test_headers_from_portal_proxy(settings):
    request = http_request(
        {
            "X-Remote-User": "CORP\\Petrov",
            "X-Remote-Name": quote("Петров Пётр Петрович"),
            "X-Remote-Email": "p.petrov@company.ru",
            "X-Remote-Groups": quote("CN=ИТ-Автоматизация-Администраторы,OU=Groups,DC=corp;CN=Все сотрудники,OU=Groups,DC=corp"),
        }
    )
    identity = identity_from_headers(request, settings)
    assert identity.login == "Petrov"
    assert identity.full_name == "Петров Пётр Петрович"
    assert is_admin_by_groups(identity.groups, settings)


def test_raw_utf8_header_is_decoded(settings):
    raw_name = "Иванова Анна".encode("utf-8").decode("latin-1")
    identity = identity_from_headers(http_request({"X-Remote-User": "ivanova", "X-Remote-Name": raw_name}), settings)
    assert identity.full_name == "Иванова Анна"
    assert not is_admin_by_groups(identity.groups, settings)


def test_headers_from_untrusted_address_are_ignored(settings):
    with pytest.raises(AppError) as error:
        identity_from_headers(http_request({"X-Remote-User": "admin"}, client_ip="192.168.1.20"), settings)
    assert error.value.status_code == 401


def test_missing_login_is_unauthenticated(settings):
    with pytest.raises(AppError) as error:
        identity_from_headers(http_request({}), settings)
    assert error.value.status_code == 401


@pytest.fixture
def jwt_settings(monkeypatch):
    current = get_settings()
    monkeypatch.setattr(current, "jwt_secret", "test-secret-with-enough-length-for-hs256")
    monkeypatch.setattr(current, "jwt_algorithms", "HS256")
    monkeypatch.setattr(current, "jwt_issuer", "portal")
    monkeypatch.setattr(current, "jwt_cookie_name", "portal_token")
    monkeypatch.setattr(current, "jwt_claim_groups", "realm.groups")
    return current


def make_token(settings, **claims) -> str:
    body = {"preferred_username": "petrov", "name": "Петров Пётр", "iss": "portal", "exp": datetime.now(timezone.utc) + timedelta(minutes=5)}
    body.update(claims)
    return jwt.encode(body, settings.jwt_secret, algorithm="HS256")


def test_jwt_from_bearer_and_cookie(jwt_settings):
    token = make_token(jwt_settings, realm={"groups": ["ИТ-Автоматизация-Администраторы"]})
    identity = identity_from_jwt(http_request({"Authorization": f"Bearer {token}"}), jwt_settings)
    assert identity.login == "petrov"
    assert is_admin_by_groups(identity.groups, jwt_settings)

    from_cookie = identity_from_jwt(http_request({}, cookies=f"portal_token={token}"), jwt_settings)
    assert from_cookie.full_name == "Петров Пётр"


@pytest.mark.parametrize(
    "token_factory",
    [
        lambda s: make_token(s, exp=datetime.now(timezone.utc) - timedelta(minutes=1)),
        lambda s: make_token(s, iss="someone-else"),
        lambda s: jwt.encode({"preferred_username": "x", "exp": datetime.now(timezone.utc) + timedelta(minutes=5), "iss": "portal"}, "wrong-secret-wrong-secret-wrong-secret", algorithm="HS256"),
    ],
    ids=["expired", "wrong-issuer", "wrong-signature"],
)
def test_invalid_jwt_is_rejected(jwt_settings, token_factory):
    with pytest.raises(AppError) as error:
        identity_from_jwt(http_request({"Authorization": f"Bearer {token_factory(jwt_settings)}"}), jwt_settings)
    assert error.value.status_code == 401
