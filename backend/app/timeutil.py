from datetime import date, datetime, timezone
from zoneinfo import ZoneInfo

from app.config import get_settings


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


def local_now() -> datetime:
    return datetime.now(ZoneInfo(get_settings().timezone))


def local_today() -> date:
    return local_now().date()


def to_local(value: datetime) -> datetime:
    return value.astimezone(ZoneInfo(get_settings().timezone))
