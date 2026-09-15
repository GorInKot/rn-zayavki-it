import uuid
from urllib.parse import quote

from fastapi import APIRouter, Depends
from fastapi.responses import FileResponse
from sqlalchemy.orm import Session

from app.auth import get_current_user
from app.db import get_db
from app.errors import AppError
from app.models import Draft, Request, RequestDocument, User
from app.services.documents import storage_path

router = APIRouter(prefix="/documents", tags=["Файлы"])


@router.get("/{document_id}/download")
def download(document_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> FileResponse:
    document = db.get(RequestDocument, document_id)
    allowed = False
    if document is not None:
        if document.request_id is not None:
            request = db.get(Request, document.request_id)
            allowed = user.is_admin or request.author_id == user.id
        if not allowed and document.draft_id is not None:
            draft = db.get(Draft, document.draft_id)
            allowed = draft is not None and draft.user_id == user.id
    path = storage_path(document.storage_key) if document else None
    if not allowed or path is None or not path.exists():
        raise AppError(404, "Файл не найден", code="not_found")
    return FileResponse(
        path,
        media_type="application/octet-stream",
        headers={
            "Content-Disposition": f"attachment; filename=\"file.{document.extension}\"; filename*=UTF-8''{quote(document.original_name)}",
            "X-Content-Type-Options": "nosniff",
        },
    )
