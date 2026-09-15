from functools import lru_cache
from pathlib import Path
from typing import Literal

from pydantic_settings import BaseSettings, SettingsConfigDict


def split_list(value: str | None) -> list[str]:
    """Списки в .env задаются через «;» — запятая встречается в DN групп AD."""
    if not value:
        return []
    return [item.strip() for item in value.replace("\n", ";").split(";") if item.strip()]


class Settings(BaseSettings):
    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    environment: Literal["development", "production", "test"] = "development"
    database_url: str = "postgresql+psycopg://zayavki:zayavki@localhost:5432/zayavki"

    # --- Аутентификация ------------------------------------------------------
    # dev     — пользователь выбирается в интерфейсе (заголовок X-Dev-User). Только для разработки.
    # headers — личность передаёт обратный прокси портала после входа через AD.
    # jwt     — портал передаёт подписанный токен (Authorization: Bearer или cookie).
    auth_mode: Literal["dev", "headers", "jwt"] = "dev"
    admin_groups: str = "ИТ-Автоматизация-Администраторы"

    header_login: str = "X-Remote-User"
    header_name: str = "X-Remote-Name"
    header_email: str = "X-Remote-Email"
    header_department: str = "X-Remote-Department"
    header_groups: str = "X-Remote-Groups"
    trusted_proxies: str = "127.0.0.1/32;::1/128"

    jwt_jwks_url: str | None = None
    jwt_public_key: str | None = None
    jwt_secret: str | None = None
    jwt_algorithms: str = "RS256"
    jwt_issuer: str | None = None
    jwt_audience: str | None = None
    jwt_cookie_name: str | None = None
    jwt_claim_login: str = "preferred_username"
    jwt_claim_name: str = "name"
    jwt_claim_email: str = "email"
    jwt_claim_department: str = "department"
    jwt_claim_groups: str = "groups"

    # --- Встраивание в портал ---------------------------------------------------
    portal_origins: str = ""

    # --- Файлы ------------------------------------------------------------------
    upload_dir: Path = Path("./data/uploads")
    max_upload_mb: int = 20
    max_files_per_request: int = 10
    allowed_extensions: str = "pdf;doc;docx;xls;xlsx;xlsm;csv;txt;rtf;odt;ods;ppt;pptx;png;jpg;jpeg;zip;7z;xml;json"

    # --- Регламент --------------------------------------------------------------
    review_business_days: int = 5
    # Часовой пояс, в котором считаются «сегодня» и сроки рассмотрения.
    timezone: str = "Europe/Moscow"

    @property
    def admin_groups_list(self) -> list[str]:
        return split_list(self.admin_groups)

    @property
    def trusted_proxies_list(self) -> list[str]:
        return split_list(self.trusted_proxies)

    @property
    def jwt_algorithms_list(self) -> list[str]:
        return split_list(self.jwt_algorithms)

    @property
    def portal_origins_list(self) -> list[str]:
        return split_list(self.portal_origins)

    @property
    def allowed_extensions_set(self) -> set[str]:
        return {ext.lower().lstrip(".") for ext in split_list(self.allowed_extensions)}

    @property
    def max_upload_bytes(self) -> int:
        return self.max_upload_mb * 1024 * 1024


@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    if settings.environment == "production" and settings.auth_mode == "dev":
        raise RuntimeError("AUTH_MODE=dev запрещён при ENVIRONMENT=production: любой сможет войти под любым пользователем.")
    return settings
