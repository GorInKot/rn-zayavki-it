from collections.abc import Iterable

from sqlalchemy import select
from sqlalchemy.orm import Session

from app import timeutil
from app.models import Notification, Request, RequestEvent, User


def admin_ids(db: Session, exclude: int | None = None) -> list[int]:
    stmt = select(User.id).where(User.is_admin.is_(True))
    if exclude is not None:
        stmt = stmt.where(User.id != exclude)
    return list(db.scalars(stmt))


def notify(db: Session, user_ids: Iterable[int], request: Request, event: RequestEvent | None, text: str) -> None:
    """Уведомление внутри системы. Когда появится почта, отправка добавляется здесь — вызывающий код не меняется."""
    for user_id in dict.fromkeys(user_ids):
        db.add(Notification(user_id=user_id, request_id=request.id, event_id=event.id if event else None, text=text, created_at=timeutil.utcnow()))
