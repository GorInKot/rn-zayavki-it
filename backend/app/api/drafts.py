import uuid

from fastapi import APIRouter, Depends, File, Response, UploadFile
from sqlalchemy.orm import Session

from app.api.deps import parse_draft_key
from app.auth import get_current_user
from app.db import get_db
from app.errors import AppError
from app.models import RequestDocument, User
from app.schemas import DocumentOut, DraftOut, DraftSave
from app.services import documents as document_service
from app.services import drafts as service

router = APIRouter(prefix="/drafts", tags=["Черновики"])


def draft_out(db: Session, user: User, request_id: uuid.UUID | None) -> DraftOut:
    request = service.target_request(db, user, request_id)
    draft = service.get_draft(db, user, request_id)
    if draft is None and request_id is None:
        raise AppError(404, "Черновика нет", code="no_draft")
    documents = [DocumentOut.model_validate(d) for d in service.draft_documents(db, draft, request)]
    if draft is None:
        # Для ответа на уточнение черновик ещё не создан — форма заполняется данными самой заявки.
        return DraftOut(request_id=request_id, data={}, version=0, updated_at=request.updated_at, documents=documents)
    return DraftOut(request_id=request_id, data=draft.data, version=draft.version, updated_at=draft.updated_at, documents=documents)


@router.get("/{key}", response_model=DraftOut)
def get_draft(key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DraftOut:
    return draft_out(db, user, parse_draft_key(key))


@router.put("/{key}", response_model=DraftOut)
def save_draft(key: str, payload: DraftSave, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DraftOut:
    request_id = parse_draft_key(key)
    if payload.version == 0:
        payload.version = None
    service.save_draft(db, user, request_id, payload)
    return draft_out(db, user, request_id)


@router.delete("/{key}", status_code=204)
def delete_draft(key: str, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    service.delete_draft(db, user, parse_draft_key(key))
    return Response(status_code=204)


@router.post("/{key}/documents", response_model=DocumentOut, status_code=201)
def upload(key: str, file: UploadFile = File(...), user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> DocumentOut:
    request_id = parse_draft_key(key)
    request = service.target_request(db, user, request_id)
    draft = service.ensure_draft(db, user, request_id)
    attached = len(service.draft_documents(db, draft, request))
    document, path = document_service.store_upload(file, user=user, draft=draft, attached_count=attached)
    try:
        db.add(document)
        db.commit()
    except BaseException:
        db.rollback()
        path.unlink(missing_ok=True)
        raise
    return DocumentOut.model_validate(document)


@router.delete("/{key}/documents/{document_id}", status_code=204)
def delete_upload(key: str, document_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    request_id = parse_draft_key(key)
    service.target_request(db, user, request_id)
    draft = service.get_draft(db, user, request_id)
    document = db.get(RequestDocument, document_id)
    # Удалить сразу можно только только что загруженный файл. Файл, уже приложенный к заявке,
    # убирается из списка в форме и удаляется при повторной отправке — до неё заявка остаётся прежней.
    if draft is None or document is None or document.draft_id != draft.id or document.request_id is not None:
        raise AppError(404, "Файл не найден", code="not_found")
    key_to_remove = document.storage_key
    db.delete(document)
    db.commit()
    document_service.remove_files([key_to_remove])
    return Response(status_code=204)
