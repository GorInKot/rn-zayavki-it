"""Определение текущего пользователя.

Своего входа у системы нет: она открывается вкладкой корпоративного портала, где сотрудник
уже вошёл через Active Directory. Портал сообщает, кто это, одним из двух способов (AUTH_MODE):
заголовками обратного прокси или подписанным JWT. Режим dev — только для локальной разработки.
"""

import ipaddress
from dataclasses import dataclass, field
from datetime import datetime, timedelta, timezone
from functools import lru_cache
from urllib.parse import unquote

import jwt
from fastapi import Depends, Request
from sqlalchemy import select
from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.config import Settings, get_settings
from app.db import get_db
from app.errors import AppError, forbidden
from app.models import User

DEV_USER_HEADER = "X-Dev-User"

# login: (ФИО, почта, подразделение, администратор)
DEV_USERS: dict[str, tuple[str, str, str, bool]] = {
    "o.smirnova": ("Смирнова Ольга Викторовна", "o.smirnova@company.ru", "Отдел экономики и планирования", False),
    "d.kovalev": ("Ковалёв Дмитрий Сергеевич", "d.kovalev@company.ru", "Транспортный участок", False),
    "g.ahmetova": ("Ахметова Гульнара Рашитовна", "g.ahmetova@company.ru", "Отдел кадров", False),
    "i.titov": ("Титов Игорь Павлович", "i.titov@company.ru", "Отдел закупок", False),
    "m.fedorova": ("Фёдорова Марина Игоревна", "m.fedorova@company.ru", "Отдел ПБОТОС", False),
    "a.nikitin": ("Никитин Артём Олегович", "a.nikitin@company.ru", "Административно-хозяйственный отдел", False),
    "s.orlov": ("Орлов Сергей Николаевич", "s.orlov@company.ru", "Группа развития информационных систем", True),
}

USER_REFRESH_INTERVAL = timedelta(minutes=5)


@dataclass
class Identity:
    login: str
    full_name: str
    email: str | None = None
    department: str | None = None
    groups: list[str] = field(default_factory=list)
    is_admin_override: bool | None = None


def unauthorized(message: str = "Не удалось определить пользователя. Откройте систему через корпоративный портал.") -> AppError:
    return AppError(401, message, code="unauthenticated")


def decode_header_value(value: str | None) -> str | None:
    """Прокси передают кириллицу по-разному: сырыми байтами UTF-8 или percent-encoding. Поддерживаем оба."""
    if value is None:
        return None
    try:
        value = value.encode("latin-1").decode("utf-8")
    except (UnicodeEncodeError, UnicodeDecodeError):
        pass
    value = unquote(value).strip()
    return value or None


def normalize_group(name: str) -> str:
    """«CN=Группа,OU=...,DC=...» и «Группа» считаются одной и той же группой."""
    name = name.strip()
    if name.upper().startswith("CN="):
        name = name[3:].split(",", 1)[0]
    return name.strip().casefold()


def split_groups(raw: str | list | None) -> list[str]:
    if raw is None:
        return []
    if isinstance(raw, list):
        return [str(item) for item in raw]
    # DN группы содержит запятые, поэтому в заголовке группы разделяются «;» или «|».
    return [part for part in raw.replace("|", ";").split(";") if part.strip()]


def is_admin_by_groups(groups: list[str], settings: Settings) -> bool:
    admin = {normalize_group(group) for group in settings.admin_groups_list}
    return any(normalize_group(group) in admin for group in groups)


def _peer_is_trusted(request: Request, settings: Settings) -> bool:
    host = request.client.host if request.client else None
    if not host:
        return False
    try:
        address = ipaddress.ip_address(host)
    except ValueError:
        return False
    return any(address in ipaddress.ip_network(network, strict=False) for network in settings.trusted_proxies_list)


def identity_from_dev(request: Request) -> Identity:
    login = request.headers.get(DEV_USER_HEADER) or next(iter(DEV_USERS))
    if login not in DEV_USERS:
        raise unauthorized(f"Неизвестный тестовый пользователь «{login}»")
    full_name, email, department, is_admin = DEV_USERS[login]
    return Identity(login=login, full_name=full_name, email=email, department=department, is_admin_override=is_admin)


def identity_from_headers(request: Request, settings: Settings) -> Identity:
    if not _peer_is_trusted(request, settings):
        # Без этой проверки любой, кто достучится до сервиса напрямую, подставит чужой логин в заголовок.
        raise unauthorized("Запрос пришёл в обход портала. Откройте систему через корпоративный портал.")
    login = decode_header_value(request.headers.get(settings.header_login))
    if not login:
        raise unauthorized()
    if "\\" in login:
        login = login.split("\\", 1)[1]
    return Identity(
        login=login,
        full_name=decode_header_value(request.headers.get(settings.header_name)) or login,
        email=decode_header_value(request.headers.get(settings.header_email)),
        department=decode_header_value(request.headers.get(settings.header_department)),
        groups=split_groups(decode_header_value(request.headers.get(settings.header_groups))),
    )


@lru_cache
def _jwks_client(url: str) -> jwt.PyJWKClient:
    return jwt.PyJWKClient(url, cache_keys=True, lifespan=3600)


def _claim(claims: dict, path: str):
    value = claims
    for part in path.split("."):
        if not isinstance(value, dict) or part not in value:
            return None
        value = value[part]
    return value


def identity_from_jwt(request: Request, settings: Settings) -> Identity:
    token = None
    authorization = request.headers.get("Authorization", "")
    if authorization.lower().startswith("bearer "):
        token = authorization[7:].strip()
    elif settings.jwt_cookie_name:
        token = request.cookies.get(settings.jwt_cookie_name)
    if not token:
        raise unauthorized()

    if settings.jwt_jwks_url:
        key = _jwks_client(settings.jwt_jwks_url).get_signing_key_from_jwt(token).key
    elif settings.jwt_public_key:
        key = settings.jwt_public_key
    elif settings.jwt_secret:
        key = settings.jwt_secret
    else:
        raise AppError(500, "Не настроена проверка токена портала (JWT_JWKS_URL, JWT_PUBLIC_KEY или JWT_SECRET)")

    try:
        claims = jwt.decode(
            token,
            key,
            algorithms=settings.jwt_algorithms_list,
            audience=settings.jwt_audience,
            issuer=settings.jwt_issuer,
            options={"require": ["exp"], "verify_aud": bool(settings.jwt_audience)},
        )
    except jwt.ExpiredSignatureError:
        raise unauthorized("Сессия портала истекла. Обновите страницу портала.")
    except jwt.PyJWTError:
        raise unauthorized()

    login = _claim(claims, settings.jwt_claim_login)
    if not login:
        raise unauthorized()
    return Identity(
        login=str(login),
        full_name=str(_claim(claims, settings.jwt_claim_name) or login),
        email=_claim(claims, settings.jwt_claim_email),
        department=_claim(claims, settings.jwt_claim_department),
        groups=split_groups(_claim(claims, settings.jwt_claim_groups)),
    )


def get_identity(request: Request) -> Identity:
    settings = get_settings()
    if settings.auth_mode == "headers":
        return identity_from_headers(request, settings)
    if settings.auth_mode == "jwt":
        return identity_from_jwt(request, settings)
    return identity_from_dev(request)


def get_current_user(identity: Identity = Depends(get_identity), db: Session = Depends(get_db)) -> User:
    settings = get_settings()
    login = identity.login.strip().lower()
    is_admin = identity.is_admin_override if identity.is_admin_override is not None else is_admin_by_groups(identity.groups, settings)
    now = datetime.now(timezone.utc)

    user = db.scalar(select(User).where(User.login == login))
    fresh = (
        user is not None
        and user.full_name == identity.full_name
        and user.email == identity.email
        and (identity.department is None or user.department == identity.department)
        and user.is_admin == is_admin
        and now - user.last_seen_at < USER_REFRESH_INTERVAL
    )
    if fresh:
        return user

    values = {"login": login, "full_name": identity.full_name, "email": identity.email, "is_admin": is_admin, "last_seen_at": now}
    update = dict(values)
    if identity.department is not None:
        values["department"] = update["department"] = identity.department
    stmt = insert(User).values(**values).on_conflict_do_update(index_elements=[User.login], set_=update).returning(User.id)
    user_id = db.execute(stmt).scalar_one()
    db.commit()
    return db.get(User, user_id, populate_existing=True)


def require_admin(user: User = Depends(get_current_user)) -> User:
    if not user.is_admin:
        raise forbidden("Раздел доступен только администраторам системы заявок")
    return user
