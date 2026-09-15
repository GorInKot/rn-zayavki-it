import uuid
from dataclasses import dataclass
from datetime import date

from sqlalchemy import Select, case, func, nulls_last, select, update
from sqlalchemy.orm import Session, selectinload

from app import timeutil
from app.config import get_settings
from app.enums import STATUS_LABELS, ActorRole, EventKind, Frequency, RequestStatus, RequestType
from app.errors import AppError, conflict_stale, forbidden, not_found
from app.models import Region, Request, RequestDocument, RequestEvent, Topic, User
from app.schemas import (
    ActionOut,
    AssignmentInput,
    CommentInput,
    DocumentOut,
    EventOut,
    RequestDetail,
    RequestInput,
    RequestListItem,
    RequestPage,
    ResubmitInput,
    SlaOut,
    TransitionInput,
    WithdrawInput,
)
from app.services import documents as document_service
from app.services import drafts as draft_service
from app.services.calendar import BusinessCalendar
from app.services.notifications import admin_ids, notify
from app.services.numbering import next_request_number
from app.services.workflow import ADMIN_TRANSITIONS, APPLICANT_WITHDRAWABLE, ASSIGNABLE, LIFECYCLE_ORDER, REVIEW_PHASE, find_transition
from app.services.workload import hours_per_month

FIELD_LABELS = {
    "applicant_phone": "Телефон",
    "applicant_department": "Подразделение",
    "region_id": "Регион",
    "type": "Тип заявки",
    "existing_system_name": "Существующая система",
    "topic_id": "Тематика",
    "topic_other": "Тематика",
    "process": "Текущий процесс",
    "problem": "Что требует автоматизации",
    "desired_result": "Желаемый результат",
    "method_suggestion": "Предложения по способу автоматизации",
    "beneficiaries": "Получатели выгоды",
    "result_recipient": "Получатель результата",
    "frequency": "Трудоёмкость",
    "duration": "Трудоёмкость",
    "duration_unit": "Трудоёмкость",
    "times_per_period": "Трудоёмкость",
    "employees_count": "Трудоёмкость",
    "workload_note": "Трудоёмкость",
}

WORKLOAD_MESSAGES = {
    "duration": "Укажите, сколько времени занимает одна операция",
    "duration_unit": "Выберите единицу измерения",
    "times_per_period": "Укажите, сколько раз операция выполняется за период",
    "employees_count": "Укажите, сколько сотрудников её выполняют",
}


# ------------------------------------------------------------------ чтение

def short_title(text: str, limit: int = 90) -> str:
    line = " ".join(text.split())
    if len(line) <= limit:
        return line
    cut = line[:limit].rsplit(" ", 1)[0]
    return cut.rstrip(",.;:—- ") + "…"


def topic_display(request: Request) -> str:
    if request.topic.requires_detail and request.topic_other:
        return request.topic_other
    return request.topic.name


def compute_sla(request: Request, calendar: BusinessCalendar, today: date) -> SlaOut:
    if request.status == RequestStatus.clarification:
        return SlaOut(state="paused", review_due_date=None, business_days_left=None)
    if request.status != RequestStatus.review or request.review_due_date is None:
        return SlaOut(state=None, review_due_date=None, business_days_left=None)
    left = calendar.business_days_between(today, request.review_due_date)
    if request.review_due_date < today:
        state = "overdue"
    elif left <= 1:
        state = "due_soon"
    else:
        state = "ok"
    return SlaOut(state=state, review_due_date=request.review_due_date, business_days_left=left)


def to_list_item(request: Request, calendar: BusinessCalendar, today: date) -> RequestListItem:
    return RequestListItem(
        id=request.id,
        number=request.number,
        status=request.status,
        type=request.type,
        title=short_title(request.process),
        topic_name=topic_display(request),
        applicant_name=request.applicant_name,
        applicant_department=request.applicant_department,
        region_name=request.region.name,
        submitted_at=request.submitted_at,
        updated_at=request.updated_at,
        review_due_date=request.review_due_date,
        deadline=request.deadline,
        responsible=request.responsible,
        is_unviewed=request.status == RequestStatus.review and request.first_viewed_at is None,
        sla=compute_sla(request, calendar, today),
    )


def actions_for(request: Request, user: User) -> list[ActionOut]:
    actions: list[ActionOut] = []
    if user.is_admin:
        for transition in ADMIN_TRANSITIONS[request.status]:
            actions.append(
                ActionOut(
                    kind="transition",
                    label=transition.label,
                    to_status=transition.to,
                    comment_required=transition.comment_required,
                    needs_assignment=transition.needs_assignment,
                    tone=transition.tone,
                )
            )
        if request.status in ASSIGNABLE:
            actions.append(ActionOut(kind="assign", label="Изменить срок или ответственного"))
    if request.author_id == user.id:
        if request.status == RequestStatus.clarification:
            actions.append(ActionOut(kind="resubmit", label="Дополнить заявку", tone="primary"))
        if request.status in APPLICANT_WITHDRAWABLE:
            actions.append(ActionOut(kind="withdraw", label="Отозвать заявку", tone="danger"))
    return actions


def to_detail(request: Request, user: User, calendar: BusinessCalendar, today: date) -> RequestDetail:
    item = to_list_item(request, calendar, today)
    events = [event for event in request.events if user.is_admin or not event.is_internal]
    return RequestDetail(
        **item.model_dump(),
        version=request.version,
        author_id=request.author_id,
        applicant_email=request.applicant_email,
        applicant_phone=request.applicant_phone,
        region_id=request.region_id,
        existing_system_name=request.existing_system_name,
        topic_id=request.topic_id,
        topic_other=request.topic_other,
        process=request.process,
        problem=request.problem,
        desired_result=request.desired_result,
        method_suggestion=request.method_suggestion,
        beneficiaries=request.beneficiaries,
        result_recipient=request.result_recipient,
        frequency=request.frequency,
        duration=request.duration,
        duration_unit=request.duration_unit,
        times_per_period=request.times_per_period,
        employees_count=request.employees_count,
        workload_note=request.workload_note,
        workload_hours_month=request.workload_hours_month,
        first_viewed_at=request.first_viewed_at,
        decided_at=request.decided_at,
        closed_at=request.closed_at,
        documents=[DocumentOut.model_validate(document) for document in request.documents],
        events=[EventOut.model_validate(event) for event in events],
        actions=actions_for(request, user),
        can_comment=request.status != RequestStatus.withdrawn,
    )


def load_request(db: Session, request_id: uuid.UUID, *, for_update: bool = False) -> Request:
    stmt = select(Request).where(Request.id == request_id)
    if for_update:
        stmt = stmt.with_for_update(of=Request)
    stmt = stmt.options(selectinload(Request.topic), selectinload(Request.region), selectinload(Request.documents), selectinload(Request.events))
    # В рамках одного запроса заявка читается повторно после изменения — берём свежие файлы и историю из базы.
    stmt = stmt.execution_options(populate_existing=True)
    request = db.scalar(stmt)
    if request is None:
        raise not_found()
    return request


def ensure_can_view(request: Request, user: User) -> None:
    # Чужая заявка для заявителя «не существует»: не раскрываем даже факт её наличия.
    if not user.is_admin and request.author_id != user.id:
        raise not_found()


def get_detail(db: Session, request_id: uuid.UUID, user: User) -> RequestDetail:
    request = load_request(db, request_id)
    ensure_can_view(request, user)
    if user.is_admin and request.status == RequestStatus.review and request.first_viewed_at is None:
        now = timeutil.utcnow()
        # Отметка о просмотре не меняет версию и дату изменения заявки.
        db.execute(update(Request).where(Request.id == request.id).values(first_viewed_at=now, updated_at=Request.updated_at))
        db.commit()
        request.first_viewed_at = now
    return to_detail(request, user, BusinessCalendar.load(db), timeutil.local_today())


STATUS_SORT = case({status.value: index for index, status in enumerate(LIFECYCLE_ORDER)}, value=Request.status)
SORT_COLUMNS = {
    "number": Request.number,
    "submitted_at": Request.submitted_at,
    "updated_at": Request.updated_at,
    "status": STATUS_SORT,
    "applicant": Request.applicant_name,
    "department": Request.applicant_department,
    "region": Region.name,
    "topic": Topic.name,
    "type": Request.type,
    "review_due_date": Request.review_due_date,
    "deadline": Request.deadline,
    "responsible": Request.responsible,
}


@dataclass
class ListFilters:
    scope: str = "mine"
    q: str | None = None
    statuses: list[RequestStatus] | None = None
    topic_id: int | None = None
    region_id: int | None = None
    type: RequestType | None = None
    attention: str | None = None
    sort: str = "submitted_at"
    direction: str = "desc"


def filtered_query(db: Session, user: User, filters: ListFilters, calendar: BusinessCalendar, today: date) -> Select:
    stmt = select(Request).join(Topic, Request.topic_id == Topic.id).join(Region, Request.region_id == Region.id)
    if filters.scope != "all" or not user.is_admin:
        stmt = stmt.where(Request.author_id == user.id)
    if filters.q:
        for token in filters.q.lower().split()[:8]:
            stmt = stmt.where(Request.search_text.contains(token, autoescape=True))
    if filters.statuses:
        stmt = stmt.where(Request.status.in_(filters.statuses))
    if filters.topic_id:
        stmt = stmt.where(Request.topic_id == filters.topic_id)
    if filters.region_id:
        stmt = stmt.where(Request.region_id == filters.region_id)
    if filters.type:
        stmt = stmt.where(Request.type == filters.type)
    if filters.attention == "overdue":
        stmt = stmt.where(Request.status == RequestStatus.review, Request.review_due_date < today)
    elif filters.attention == "due_soon":
        stmt = stmt.where(
            Request.status == RequestStatus.review,
            Request.review_due_date >= today,
            Request.review_due_date <= calendar.add_business_days(today, 1),
        )
    elif filters.attention == "unviewed":
        stmt = stmt.where(Request.status == RequestStatus.review, Request.first_viewed_at.is_(None))
    return stmt


def list_requests(db: Session, user: User, filters: ListFilters, page: int, page_size: int) -> RequestPage:
    calendar = BusinessCalendar.load(db)
    today = timeutil.local_today()
    stmt = filtered_query(db, user, filters, calendar, today)
    total = db.scalar(select(func.count()).select_from(stmt.subquery()))

    column = SORT_COLUMNS.get(filters.sort, Request.submitted_at)
    ordering = column.asc() if filters.direction == "asc" else column.desc()
    stmt = (
        stmt.options(selectinload(Request.topic), selectinload(Request.region))
        .order_by(nulls_last(ordering), Request.submitted_at.desc(), Request.id)
        .offset((page - 1) * page_size)
        .limit(page_size)
    )
    items = [to_list_item(request, calendar, today) for request in db.scalars(stmt)]
    return RequestPage(items=items, total=total, page=page, page_size=page_size)


# ------------------------------------------------------------------ запись

def validation_error(errors: list[dict]) -> AppError:
    return AppError(422, "Проверьте заполнение формы", errors=errors, code="validation")


def validate_input(db: Session, payload: RequestInput, attachable: dict[uuid.UUID, RequestDocument]) -> None:
    settings = get_settings()
    errors: list[dict] = []

    region = db.get(Region, payload.applicant.region_id)
    if region is None or not region.is_active:
        errors.append({"path": "applicant.region_id", "message": "Выберите регион из списка"})
    topic = db.get(Topic, payload.topic_id)
    if topic is None or not topic.is_active:
        errors.append({"path": "topic_id", "message": "Выберите тематику из списка"})
    elif topic.requires_detail and not payload.topic_other:
        errors.append({"path": "topic_other", "message": "Укажите тематику"})
    if payload.type == RequestType.upgrade and not payload.existing_system_name:
        errors.append({"path": "existing_system_name", "message": "Укажите название существующей системы"})

    workload = payload.workload
    if workload.frequency == Frequency.irregular:
        if not workload.note:
            errors.append({"path": "workload.note", "message": "Опишите, как часто возникает процесс и сколько времени он занимает"})
    else:
        for field, message in WORKLOAD_MESSAGES.items():
            if getattr(workload, field) is None:
                errors.append({"path": f"workload.{field}", "message": message})

    if len(payload.documents) > settings.max_files_per_request:
        errors.append({"path": "documents", "message": f"Можно приложить не более {settings.max_files_per_request} файлов"})
    seen: set[uuid.UUID] = set()
    for index, ref in enumerate(payload.documents):
        if ref.id not in attachable or ref.id in seen:
            errors.append({"path": f"documents.{index}", "message": "Файл не найден. Загрузите его заново"})
        seen.add(ref.id)

    if errors:
        raise validation_error(errors)


def apply_input(request: Request, payload: RequestInput) -> list[str]:
    """Переносит данные формы в заявку и возвращает названия изменённых разделов."""
    workload = payload.workload
    values = {
        "applicant_phone": payload.applicant.phone,
        "applicant_department": payload.applicant.department,
        "region_id": payload.applicant.region_id,
        "type": payload.type,
        "existing_system_name": payload.existing_system_name if payload.type == RequestType.upgrade else None,
        "topic_id": payload.topic_id,
        "topic_other": payload.topic_other,
        "process": payload.process,
        "problem": payload.problem,
        "desired_result": payload.desired_result,
        "method_suggestion": payload.method_suggestion,
        "beneficiaries": payload.beneficiaries,
        "result_recipient": payload.result_recipient,
        "frequency": workload.frequency,
        "duration": workload.duration,
        "duration_unit": workload.duration_unit,
        "times_per_period": workload.times_per_period,
        "employees_count": workload.employees_count,
        "workload_note": workload.note,
    }
    changed: list[str] = []
    for field, value in values.items():
        if getattr(request, field, None) != value:
            label = FIELD_LABELS[field]
            if label not in changed:
                changed.append(label)
            setattr(request, field, value)
    request.workload_hours_month = hours_per_month(
        workload.frequency, workload.duration, workload.duration_unit, workload.times_per_period, workload.employees_count
    )
    return changed


def attach_documents(db: Session, request: Request, payload: RequestInput, attachable: dict[uuid.UUID, RequestDocument]) -> tuple[list[str], list[str]]:
    """Прикрепляет выбранные файлы, удаляет остальные. Возвращает (ключи файлов к удалению, изменения для истории)."""
    kept = {ref.id for ref in payload.documents}
    removed_keys: list[str] = []
    changes: list[str] = []
    for ref in payload.documents:
        document = attachable[ref.id]
        if document.request_id is None:
            changes.append(f"добавлен файл «{document.original_name}»")
        document.request_id = request.id
        document.draft_id = None
        document.usage = ref.usage
        document.future_use = ref.future_use
    for document_id, document in attachable.items():
        if document_id not in kept:
            if document.request_id is not None:
                changes.append(f"удалён файл «{document.original_name}»")
            removed_keys.append(document.storage_key)
            db.delete(document)
    return removed_keys, changes


def add_event(
    db: Session,
    request: Request,
    *,
    kind: EventKind,
    actor: User,
    role: ActorRole,
    from_status: RequestStatus | None = None,
    to_status: RequestStatus | None = None,
    comment: str | None = None,
    is_internal: bool = False,
    payload: dict | None = None,
) -> RequestEvent:
    event = RequestEvent(
        request_id=request.id,
        kind=kind,
        from_status=from_status,
        to_status=to_status,
        comment=comment or None,
        is_internal=is_internal,
        actor_id=actor.id,
        actor_name=actor.full_name,
        actor_role=role,
        payload=payload,
        created_at=timeutil.utcnow(),
    )
    db.add(event)
    db.flush()
    return event


def check_version(request: Request, version: int) -> None:
    if request.version != version:
        raise conflict_stale()


def create_request(db: Session, user: User, payload: RequestInput) -> Request:
    if not payload.consent:
        raise validation_error([{"path": "consent", "message": "Подтвердите согласие на обработку персональных данных"}])

    draft = draft_service.get_draft(db, user, None, for_update=True)
    attachable = {document.id: document for document in draft_service.draft_documents(db, draft, None)}
    validate_input(db, payload, attachable)

    now = timeutil.utcnow()
    today = timeutil.local_today()
    calendar = BusinessCalendar.load(db)
    request = Request(
        id=uuid.uuid4(),
        number=next_request_number(db, today.year),
        status=RequestStatus.review,
        author_id=user.id,
        applicant_name=user.full_name,
        applicant_email=user.email,
        consent_at=now,
        submitted_at=now,
        created_at=now,
        updated_at=now,
        review_due_date=calendar.add_business_days(today, get_settings().review_business_days),
    )
    apply_input(request, payload)
    db.add(request)
    db.flush()

    removed_keys, _ = attach_documents(db, request, payload, attachable)
    removed_keys += draft_service.discard(db, draft)

    event = add_event(db, request, kind=EventKind.submitted, actor=user, role=ActorRole.applicant, to_status=RequestStatus.review)
    user.last_phone = payload.applicant.phone
    user.last_region_id = payload.applicant.region_id
    if not user.department:
        user.department = payload.applicant.department
    notify(db, admin_ids(db, exclude=user.id), request, event, f"Новая заявка {request.number}: {short_title(request.process, 70)}")
    db.commit()
    document_service.remove_files(removed_keys)
    return request


def resubmit_request(db: Session, user: User, request_id: uuid.UUID, payload: ResubmitInput) -> Request:
    request = load_request(db, request_id, for_update=True)
    if request.author_id != user.id:
        raise not_found()
    if request.status != RequestStatus.clarification:
        raise AppError(409, "Заявка уже не ожидает уточнения. Обновите страницу, чтобы увидеть её текущий статус.", code="not_clarification")
    check_version(request, payload.version)

    draft = draft_service.get_draft(db, user, request.id, for_update=True)
    attachable = {document.id: document for document in draft_service.draft_documents(db, draft, request)}
    validate_input(db, payload, attachable)

    changed = apply_input(request, payload)
    removed_keys, file_changes = attach_documents(db, request, payload, attachable)
    removed_keys += draft_service.discard(db, draft)

    today = timeutil.local_today()
    request.status = RequestStatus.review
    request.review_due_date = BusinessCalendar.load(db).add_business_days(today, get_settings().review_business_days)
    request.first_viewed_at = None
    request.version += 1

    event = add_event(
        db,
        request,
        kind=EventKind.resubmitted,
        actor=user,
        role=ActorRole.applicant,
        from_status=RequestStatus.clarification,
        to_status=RequestStatus.review,
        payload={"changed": changed, "files": file_changes},
    )
    notify(db, admin_ids(db, exclude=user.id), request, event, f"Заявка {request.number} дополнена и снова ждёт рассмотрения")
    db.commit()
    document_service.remove_files(removed_keys)
    return request


def withdraw_request(db: Session, user: User, request_id: uuid.UUID, payload: WithdrawInput) -> Request:
    request = load_request(db, request_id, for_update=True)
    if request.author_id != user.id:
        raise not_found()
    if request.status not in APPLICANT_WITHDRAWABLE:
        raise AppError(409, "Заявку уже взяли в работу или рассмотрели — отозвать её нельзя. Напишите комментарий администратору.", code="cannot_withdraw")
    check_version(request, payload.version)

    previous = request.status
    request.status = RequestStatus.withdrawn
    request.review_due_date = None
    request.closed_at = timeutil.utcnow()
    request.version += 1
    removed_keys = draft_service.discard(db, draft_service.get_draft(db, user, request.id, for_update=True))
    event = add_event(
        db, request, kind=EventKind.withdrawn, actor=user, role=ActorRole.applicant, from_status=previous, to_status=RequestStatus.withdrawn, comment=payload.comment
    )
    notify(db, admin_ids(db, exclude=user.id), request, event, f"Заявитель отозвал заявку {request.number}")
    db.commit()
    document_service.remove_files(removed_keys)
    return request


def transition_request(db: Session, admin: User, request_id: uuid.UUID, payload: TransitionInput) -> Request:
    request = load_request(db, request_id, for_update=True)
    check_version(request, payload.version)
    transition = find_transition(request.status, payload.to_status)
    if transition is None:
        raise AppError(
            409,
            f"Из статуса «{STATUS_LABELS[request.status]}» нельзя перейти в «{STATUS_LABELS[payload.to_status]}». Обновите страницу.",
            code="invalid_transition",
        )

    today = timeutil.local_today()
    errors = []
    if transition.comment_required and not payload.comment:
        message = "Опишите, что нужно уточнить" if transition.to == RequestStatus.clarification else "Укажите причину — заявитель увидит этот комментарий"
        errors.append({"path": "comment", "message": message})
    if transition.needs_assignment:
        if not payload.responsible:
            errors.append({"path": "responsible", "message": "Укажите ответственного сотрудника или команду"})
        if payload.deadline is None:
            errors.append({"path": "deadline", "message": "Укажите ориентировочный срок реализации"})
        elif payload.deadline < today:
            errors.append({"path": "deadline", "message": "Срок не может быть в прошлом"})
    if errors:
        raise validation_error(errors)

    previous = request.status
    now = timeutil.utcnow()
    event_payload = None
    calendar = BusinessCalendar.load(db)

    if transition.to == RequestStatus.clarification:
        request.review_due_date = None
    elif transition.to == RequestStatus.review:
        request.review_due_date = calendar.add_business_days(today, get_settings().review_business_days)
    if previous in REVIEW_PHASE and transition.to in {RequestStatus.accepted, RequestStatus.rejected}:
        request.review_due_date = None
        request.decided_at = request.decided_at or now
    if transition.needs_assignment:
        request.responsible = payload.responsible
        request.deadline = payload.deadline
        event_payload = {"responsible": payload.responsible, "deadline": payload.deadline.isoformat()}
    if transition.to == RequestStatus.closed:
        request.closed_at = now
    elif previous == RequestStatus.closed:
        request.closed_at = None

    request.status = transition.to
    request.version += 1
    event = add_event(
        db,
        request,
        kind=EventKind.status_changed,
        actor=admin,
        role=ActorRole.admin,
        from_status=previous,
        to_status=transition.to,
        comment=payload.comment,
        payload=event_payload,
    )
    if request.author_id != admin.id:
        notify(db, [request.author_id], request, event, f"Заявка {request.number}: статус изменён на «{STATUS_LABELS[transition.to]}»")
    db.commit()
    return request


def change_assignment(db: Session, admin: User, request_id: uuid.UUID, payload: AssignmentInput) -> Request:
    request = load_request(db, request_id, for_update=True)
    check_version(request, payload.version)
    if request.status not in ASSIGNABLE:
        raise AppError(409, "Срок и ответственного можно менять только у заявок в работе.", code="not_assignable")
    if payload.deadline < timeutil.local_today():
        raise validation_error([{"path": "deadline", "message": "Срок не может быть в прошлом"}])

    changes = {}
    if request.responsible != payload.responsible:
        changes["responsible"] = [request.responsible, payload.responsible]
        request.responsible = payload.responsible
    if request.deadline != payload.deadline:
        changes["deadline"] = [request.deadline.isoformat() if request.deadline else None, payload.deadline.isoformat()]
        request.deadline = payload.deadline
    if not changes:
        raise validation_error([{"path": "deadline", "message": "Срок и ответственный не изменились"}])

    request.version += 1
    event = add_event(db, request, kind=EventKind.assignment_changed, actor=admin, role=ActorRole.admin, comment=payload.comment, payload=changes)
    if request.author_id != admin.id:
        text = f"Заявка {request.number}: " + ("изменён срок реализации" if "deadline" in changes else "назначен другой ответственный")
        notify(db, [request.author_id], request, event, text)
    db.commit()
    return request


def add_comment(db: Session, user: User, request_id: uuid.UUID, payload: CommentInput) -> RequestEvent:
    request = load_request(db, request_id)
    ensure_can_view(request, user)
    if payload.is_internal and not user.is_admin:
        raise forbidden("Служебные заметки доступны только администраторам")
    if request.status == RequestStatus.withdrawn:
        raise AppError(409, "Заявка отозвана — комментарии к ней не принимаются.", code="withdrawn")

    role = ActorRole.admin if user.is_admin and request.author_id != user.id else ActorRole.applicant
    event = add_event(db, request, kind=EventKind.comment, actor=user, role=role, comment=payload.text, is_internal=payload.is_internal)
    db.execute(update(Request).where(Request.id == request.id).values(updated_at=func.now()))
    if not payload.is_internal:
        recipients = admin_ids(db, exclude=user.id) if request.author_id == user.id else [request.author_id]
        notify(db, recipients, request, event, f"Новый комментарий к заявке {request.number}")
    db.commit()
    return event
