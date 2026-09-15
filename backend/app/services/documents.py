import os
import re
import shutil
import unicodedata
import uuid
from pathlib import Path

from fastapi import UploadFile

from app.config import get_settings
from app.errors import AppError
from app.models import Draft, RequestDocument, User

_EXTENSION = re.compile(r"^[a-z0-9]{1,10}$")
CHUNK = 1024 * 256


def storage_path(storage_key: str) -> Path:
    return get_settings().upload_dir / storage_key[:2] / storage_key


def safe_display_name(filename: str | None) -> str:
    name = (filename or "").replace("\\", "/").rsplit("/", 1)[-1]
    name = "".join(ch for ch in unicodedata.normalize("NFC", name) if unicodedata.category(ch)[0] != "C").strip()
    return (name or "файл")[:255]


def safe_extension(filename: str) -> str | None:
    if "." not in filename:
        return None
    extension = filename.rsplit(".", 1)[1].lower()
    if not _EXTENSION.match(extension) or extension not in get_settings().allowed_extensions_set:
        return None
    return extension


def upload_error(message: str, status_code: int = 422) -> AppError:
    return AppError(status_code, message, errors=[{"path": "documents", "message": message}], code="upload")


def store_upload(file: UploadFile, *, user: User, draft: Draft, attached_count: int) -> tuple[RequestDocument, Path]:
    settings = get_settings()
    name = safe_display_name(file.filename)
    extension = safe_extension(name)
    if extension is None:
        allowed = ", ".join(sorted(settings.allowed_extensions_set))
        raise upload_error(f"Файл «{name}» не загружен: такой тип файлов не принимается. Подходят: {allowed}")
    if attached_count >= settings.max_files_per_request:
        raise upload_error(f"К заявке можно приложить не более {settings.max_files_per_request} файлов")

    storage_key = uuid.uuid4().hex
    path = storage_path(storage_key)
    path.parent.mkdir(parents=True, exist_ok=True)
    size = 0
    try:
        with path.open("wb") as target:
            while chunk := file.file.read(CHUNK):
                size += len(chunk)
                if size > settings.max_upload_bytes:
                    raise upload_error(f"Файл «{name}» больше {settings.max_upload_mb} МБ", 413)
                target.write(chunk)
    except BaseException:
        path.unlink(missing_ok=True)
        raise
    if size == 0:
        path.unlink(missing_ok=True)
        raise upload_error(f"Файл «{name}» пустой")

    document = RequestDocument(
        id=uuid.uuid4(),
        draft_id=draft.id,
        uploaded_by=user.id,
        original_name=name,
        extension=extension,
        content_type=(file.content_type or "application/octet-stream")[:128],
        size_bytes=size,
        storage_key=storage_key,
    )
    return document, path


def remove_files(storage_keys: list[str]) -> None:
    """Вызывается после фиксации транзакции, чтобы при откате не потерять файлы, на которые ещё есть ссылки."""
    for key in storage_keys:
        try:
            storage_path(key).unlink(missing_ok=True)
        except OSError:
            pass


def cleanup_stale_tmp(directory: Path) -> None:
    if directory.exists():
        for entry in directory.glob("*.tmp"):
            if entry.is_file():
                os.unlink(entry)


def copy_to(storage_key: str, destination: Path) -> None:
    shutil.copyfile(storage_path(storage_key), destination)
