from datetime import date

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy import extract, select
from sqlalchemy.orm import Session

from app.auth import require_admin
from app.db import get_db
from app.models import CalendarDay, User
from app.schemas import CalendarDayInput, CalendarDayOut
from app.services.dashboard import build_dashboard

router = APIRouter(prefix="/admin", tags=["Администрирование"])


@router.get("/dashboard")
def dashboard(_: User = Depends(require_admin), db: Session = Depends(get_db)) -> dict:
    return build_dashboard(db)


@router.get("/calendar", response_model=list[CalendarDayOut])
def calendar(year: int = Query(..., ge=2000, le=2100), _: User = Depends(require_admin), db: Session = Depends(get_db)) -> list[CalendarDay]:
    return list(db.scalars(select(CalendarDay).where(extract("year", CalendarDay.day) == year).order_by(CalendarDay.day)))


@router.put("/calendar/{day}", response_model=CalendarDayOut)
def set_day(day: date, payload: CalendarDayInput, _: User = Depends(require_admin), db: Session = Depends(get_db)) -> CalendarDay:
    row = db.get(CalendarDay, day)
    if row is None:
        row = CalendarDay(day=day, is_working=payload.is_working, note=payload.note)
        db.add(row)
    else:
        row.is_working = payload.is_working
        row.note = payload.note
    db.commit()
    return row


@router.delete("/calendar/{day}", status_code=204)
def delete_day(day: date, _: User = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    row = db.get(CalendarDay, day)
    if row is not None:
        db.delete(row)
        db.commit()
    return Response(status_code=204)
