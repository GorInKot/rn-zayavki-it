import json
import uuid

from sqlalchemy import or_, select, update
from sqlalchemy.orm import Session

from app.enums import RequestStatus
from app.errors import AppError, not_found
from app.models import Draft, Request, RequestDocument, User
from app.schemas import DraftSave
from app.services import documents as document_service

MAX_DRAFT_BYTES = 512 * 1024


def draft_conflict() -> AppError:
    return AppError(
        409,
        "Черновик изменён в другой вкладке или на другом компьютере. Обновите страницу, чтобы продолжить с актуальной версии.",
        code="stale_draft",
    )


def target_request(db: Session, user: User, request_id: uuid.UUID | None) -> Request | None:
    if request_id is None:
        return None
    request = db.get(Request, request_id)
    if request is None or request.author_id != user.id:
        raise not_found()
    if request.status != RequestStatus.clarification:
        raise AppError(409, "Заявка уже не ожидает уточнения — дополнять её сейчас не нужно.", code="not_clarification")
    return request


def get_draft(db: Session, user: User, request_id: uuid.UUID | None, *, for_update: bool = False) -> Draft | None:
    stmt = select(Draft).where(Draft.user_id == user.id)
    stmt = stmt.where(Draft.request_id.is_(None) if request_id is None else Draft.request_id == request_id)
    if for_update:
        stmt = stmt.with_for_update()
    return db.scalar(stmt)


def draft_documents(db: Session, draft: Draft | None, request: Request | None) -> list[RequestDocument]:
    """Файлы, доступные в форме: уже приложенные к заявке и загруженные в этот черновик."""
    conditions = []
    if draft is not None:
        conditions.append(RequestDocument.draft_id == draft.id)
    if request is not None:
        conditions.append(RequestDocument.request_id == request.id)
    if not conditions:
        return []
    return list(db.scalars(select(RequestDocument).where(or_(*conditions)).order_by(RequestDocument.created_at)))


def ensure_draft(db: Session, user: User, request_id: uuid.UUID | None) -> Draft:
    draft = get_draft(db, user, request_id, for_update=True)
    if draft is None:
        draft = Draft(id=uuid.uuid4(), user_id=user.id, request_id=request_id, data={}, version=1)
        db.add(draft)
        db.flush()
    return draft


def save_draft(db: Session, user: User, request_id: uuid.UUID | None, payload: DraftSave) -> Draft:
    target_request(db, user, request_id)
    if len(json.dumps(payload.data, ensure_ascii=False).encode()) > MAX_DRAFT_BYTES:
        raise AppError(413, "Черновик слишком большой для сохранения. Сократите текст в полях формы.", code="draft_too_large")

    draft = get_draft(db, user, request_id, for_update=True)
    if draft is None:
        if payload.version is not None:
            raise draft_conflict()
        draft = Draft(id=uuid.uuid4(), user_id=user.id, request_id=request_id, data=payload.data, version=1)
        db.add(draft)
    else:
        # Черновик мог быть создан загрузкой файла до первого автосохранения — тогда версия 1 и данных нет.
        if payload.version != draft.version and not (payload.version is None and not draft.data):
            raise draft_conflict()
        draft.data = payload.data
        draft.version += 1
    db.commit()
    return draft


def discard(db: Session, draft: Draft | None) -> list[str]:
    """Удаляет черновик в текущей транзакции и возвращает ключи файлов, которые нужно стереть после фиксации."""
    if draft is None:
        return []
    # Сначала сохраняем перенос файлов в заявку: иначе каскадное удаление черновика заберёт и их.
    db.flush()
    orphan_keys = list(db.scalars(select(RequestDocument.storage_key).where(RequestDocument.draft_id == draft.id, RequestDocument.request_id.is_(None))))
    db.execute(update(RequestDocument).where(RequestDocument.draft_id == draft.id, RequestDocument.request_id.is_not(None)).values(draft_id=None))
    db.delete(draft)
    db.flush()
    return orphan_keys


def delete_draft(db: Session, user: User, request_id: uuid.UUID | None) -> None:
    draft = get_draft(db, user, request_id, for_update=True)
    if draft is None:
        return
    orphan_keys = discard(db, draft)
    db.commit()
    document_service.remove_files(orphan_keys)
