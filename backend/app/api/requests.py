import uuid
from typing import Literal
from urllib.parse import quote

from fastapi import APIRouter, Depends, Query, Response
from sqlalchemy.orm import Session

from app import timeutil
from app.auth import get_current_user, require_admin
from app.db import get_db
from app.enums import RequestStatus, RequestType
from app.models import User
from app.schemas import (
    AssignmentInput,
    CommentInput,
    EventOut,
    RequestDetail,
    RequestInput,
    RequestPage,
    ResubmitInput,
    TransitionInput,
    WithdrawInput,
)
from app.services import requests as service
from app.services.export import export_xlsx

router = APIRouter(prefix="/requests", tags=["Заявки"])

SortField = Literal[
    "number", "submitted_at", "updated_at", "status", "applicant", "department", "region", "topic", "type", "review_due_date", "deadline", "responsible"
]


def list_filters(
    scope: Literal["mine", "all"] = "mine",
    q: str | None = Query(None, max_length=200),
    status: list[RequestStatus] | None = Query(None),
    topic_id: int | None = None,
    region_id: int | None = None,
    type: RequestType | None = None,
    attention: Literal["overdue", "due_soon", "unviewed"] | None = None,
    sort: SortField = "submitted_at",
    direction: Literal["asc", "desc"] = "desc",
) -> service.ListFilters:
    return service.ListFilters(
        scope=scope, q=q, statuses=status, topic_id=topic_id, region_id=region_id, type=type, attention=attention, sort=sort, direction=direction
    )


def detail(db: Session, request_id: uuid.UUID, user: User) -> RequestDetail:
    return service.get_detail(db, request_id, user)


@router.get("", response_model=RequestPage)
def list_requests(
    filters: service.ListFilters = Depends(list_filters),
    page: int = Query(1, ge=1),
    page_size: int = Query(20, ge=1, le=100),
    user: User = Depends(get_current_user),
    db: Session = Depends(get_db),
) -> RequestPage:
    return service.list_requests(db, user, filters, page, page_size)


@router.get("/export.xlsx", response_class=Response)
def export(filters: service.ListFilters = Depends(list_filters), admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> Response:
    filters.scope = "all"
    content = export_xlsx(db, admin, filters)
    filename = f"Заявки на автоматизацию {timeutil.local_today().strftime('%d.%m.%Y')}.xlsx"
    return Response(
        content,
        media_type="application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
        headers={"Content-Disposition": f"attachment; filename=\"requests.xlsx\"; filename*=UTF-8''{quote(filename)}"},
    )


@router.post("", response_model=RequestDetail, status_code=201)
def create(payload: RequestInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RequestDetail:
    request = service.create_request(db, user, payload)
    return detail(db, request.id, user)


@router.get("/{request_id}", response_model=RequestDetail)
def get(request_id: uuid.UUID, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RequestDetail:
    return detail(db, request_id, user)


@router.post("/{request_id}/resubmit", response_model=RequestDetail)
def resubmit(request_id: uuid.UUID, payload: ResubmitInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RequestDetail:
    service.resubmit_request(db, user, request_id, payload)
    return detail(db, request_id, user)


@router.post("/{request_id}/withdraw", response_model=RequestDetail)
def withdraw(request_id: uuid.UUID, payload: WithdrawInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> RequestDetail:
    service.withdraw_request(db, user, request_id, payload)
    return detail(db, request_id, user)


@router.post("/{request_id}/transitions", response_model=RequestDetail)
def transition(request_id: uuid.UUID, payload: TransitionInput, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> RequestDetail:
    service.transition_request(db, admin, request_id, payload)
    return detail(db, request_id, admin)


@router.put("/{request_id}/assignment", response_model=RequestDetail)
def assignment(request_id: uuid.UUID, payload: AssignmentInput, admin: User = Depends(require_admin), db: Session = Depends(get_db)) -> RequestDetail:
    service.change_assignment(db, admin, request_id, payload)
    return detail(db, request_id, admin)


@router.post("/{request_id}/comments", response_model=EventOut, status_code=201)
def comment(request_id: uuid.UUID, payload: CommentInput, user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> EventOut:
    return EventOut.model_validate(service.add_comment(db, user, request_id, payload))
