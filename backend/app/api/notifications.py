from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import func, select, update
from sqlalchemy.orm import Session, selectinload

from app import timeutil
from app.auth import get_current_user
from app.db import get_db
from app.errors import AppError
from app.models import Notification, User
from app.schemas import NotificationOut, NotificationPage

router = APIRouter(prefix="/notifications", tags=["Уведомления"])


@router.get("", response_model=NotificationPage)
def list_notifications(
    unread_only: bool = False, limit: int = Query(50, ge=1, le=200), user: User = Depends(get_current_user), db: Session = Depends(get_db)
) -> NotificationPage:
    stmt = select(Notification).where(Notification.user_id == user.id).options(selectinload(Notification.request))
    if unread_only:
        stmt = stmt.where(Notification.read_at.is_(None))
    rows = db.scalars(stmt.order_by(Notification.created_at.desc(), Notification.id.desc()).limit(limit))
    unread = db.scalar(select(func.count()).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    items = [
        NotificationOut(id=n.id, request_id=n.request_id, request_number=n.request.number, text=n.text, created_at=n.created_at, read_at=n.read_at)
        for n in rows
    ]
    return NotificationPage(items=items, unread=unread)


@router.post("/{notification_id}/read", status_code=204)
def mark_read(notification_id: int, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    result = db.execute(
        update(Notification)
        .where(Notification.id == notification_id, Notification.user_id == user.id, Notification.read_at.is_(None))
        .values(read_at=timeutil.utcnow())
    )
    if result.rowcount == 0 and db.get(Notification, notification_id) is None:
        raise AppError(404, "Уведомление не найдено", code="not_found")
    db.commit()
    return Response(status_code=204)


@router.post("/read-all", status_code=204)
def mark_all_read(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> Response:
    db.execute(update(Notification).where(Notification.user_id == user.id, Notification.read_at.is_(None)).values(read_at=timeutil.utcnow()))
    db.commit()
    return Response(status_code=204)
