import uuid

from app.errors import AppError


def parse_draft_key(key: str) -> uuid.UUID | None:
    """«new» — черновик новой заявки, UUID — ответ на запрос уточнения по этой заявке."""
    if key == "new":
        return None
    try:
        return uuid.UUID(key)
    except ValueError:
        raise AppError(404, "Черновик не найден", code="not_found")
