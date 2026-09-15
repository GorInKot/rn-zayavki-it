import uuid
from datetime import date, datetime
from decimal import Decimal
from typing import Literal

from pydantic import BaseModel, ConfigDict, Field, field_validator

from app.enums import ActorRole, DurationUnit, EventKind, Frequency, RequestStatus, RequestType
from app.services.phone import normalize_phone


class InputModel(BaseModel):
    model_config = ConfigDict(str_strip_whitespace=True, extra="forbid")


class OutputModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


def _blank_to_none(value):
    return None if isinstance(value, str) and not value.strip() else value


# ---------------------------------------------------------------- ввод заявки

class ApplicantInput(InputModel):
    phone: str = Field(max_length=64)
    department: str = Field(min_length=1, max_length=256)
    region_id: int

    @field_validator("phone")
    @classmethod
    def _normalize_phone(cls, value: str) -> str:
        return normalize_phone(value)


class WorkloadInput(InputModel):
    frequency: Frequency
    duration: Decimal | None = Field(None, gt=0, le=10000, max_digits=10, decimal_places=2)
    duration_unit: DurationUnit | None = None
    times_per_period: int | None = Field(None, ge=1, le=100000)
    employees_count: int | None = Field(None, ge=1, le=100000)
    note: str | None = Field(None, max_length=4000)

    _blanks = field_validator("duration", "duration_unit", "times_per_period", "employees_count", "note", mode="before")(
        lambda cls, value: _blank_to_none(value)
    )


class DocumentRef(InputModel):
    id: uuid.UUID
    usage: str | None = Field(None, max_length=4000)
    future_use: str | None = Field(None, max_length=4000)


class RequestInput(InputModel):
    applicant: ApplicantInput
    type: RequestType
    existing_system_name: str | None = Field(None, max_length=500)
    topic_id: int
    topic_other: str | None = Field(None, max_length=200)
    process: str = Field(min_length=1, max_length=20000)
    problem: str = Field(min_length=1, max_length=20000)
    desired_result: str = Field(min_length=1, max_length=20000)
    method_suggestion: str | None = Field(None, max_length=20000)
    beneficiaries: str = Field(min_length=1, max_length=4000)
    result_recipient: str = Field(min_length=1, max_length=4000)
    workload: WorkloadInput
    documents: list[DocumentRef] = Field(default_factory=list, max_length=50)
    consent: bool = False

    _blanks = field_validator("existing_system_name", "topic_other", "method_suggestion", mode="before")(
        lambda cls, value: _blank_to_none(value)
    )


class ResubmitInput(RequestInput):
    version: int


class TransitionInput(InputModel):
    to_status: RequestStatus
    comment: str | None = Field(None, max_length=4000)
    responsible: str | None = Field(None, max_length=256)
    deadline: date | None = None
    version: int


class AssignmentInput(InputModel):
    responsible: str = Field(min_length=1, max_length=256)
    deadline: date
    comment: str | None = Field(None, max_length=4000)
    version: int


class WithdrawInput(InputModel):
    comment: str | None = Field(None, max_length=4000)
    version: int


class CommentInput(InputModel):
    text: str = Field(min_length=1, max_length=4000)
    is_internal: bool = False


class DraftSave(InputModel):
    data: dict
    version: int | None = None


class CalendarDayInput(InputModel):
    is_working: bool
    note: str | None = Field(None, max_length=256)


# ---------------------------------------------------------------- вывод

class RegionOut(OutputModel):
    id: int
    name: str


class TopicOut(OutputModel):
    id: int
    name: str
    requires_detail: bool


class UserOut(OutputModel):
    id: int
    login: str
    full_name: str
    email: str | None
    department: str | None
    is_admin: bool


class ApplicantDefaults(BaseModel):
    full_name: str
    email: str | None
    phone: str | None
    department: str | None
    region_id: int | None


class MeOut(BaseModel):
    user: UserOut
    auth_mode: str
    unread_notifications: int
    applicant_defaults: ApplicantDefaults
    dev_users: list[dict] | None = None


class Option(BaseModel):
    value: str
    label: str


class DictionariesOut(BaseModel):
    regions: list[RegionOut]
    topics: list[TopicOut]
    statuses: list[Option]
    request_types: list[Option]
    frequencies: list[Option]
    duration_units: list[Option]
    max_upload_mb: int
    max_files_per_request: int
    allowed_extensions: list[str]
    review_business_days: int


class DocumentOut(OutputModel):
    id: uuid.UUID
    original_name: str
    extension: str
    size_bytes: int
    usage: str | None
    future_use: str | None
    created_at: datetime


class EventOut(OutputModel):
    id: int
    kind: EventKind
    from_status: RequestStatus | None
    to_status: RequestStatus | None
    comment: str | None
    is_internal: bool
    actor_name: str
    actor_role: ActorRole
    payload: dict | None
    created_at: datetime


class SlaOut(BaseModel):
    state: Literal["ok", "due_soon", "overdue", "paused"] | None
    review_due_date: date | None
    business_days_left: int | None


class ActionOut(BaseModel):
    kind: Literal["transition", "resubmit", "withdraw", "assign"]
    label: str
    to_status: RequestStatus | None = None
    comment_required: bool = False
    needs_assignment: bool = False
    tone: Literal["primary", "secondary", "danger"] = "secondary"


class RequestListItem(BaseModel):
    id: uuid.UUID
    number: str
    status: RequestStatus
    type: RequestType
    title: str
    topic_name: str
    applicant_name: str
    applicant_department: str
    region_name: str
    submitted_at: datetime
    updated_at: datetime
    review_due_date: date | None
    deadline: date | None
    responsible: str | None
    is_unviewed: bool
    sla: SlaOut


class RequestPage(BaseModel):
    items: list[RequestListItem]
    total: int
    page: int
    page_size: int


class RequestDetail(RequestListItem):
    version: int
    author_id: int
    applicant_email: str | None
    applicant_phone: str
    region_id: int
    existing_system_name: str | None
    topic_id: int
    topic_other: str | None
    process: str
    problem: str
    desired_result: str
    method_suggestion: str | None
    beneficiaries: str
    result_recipient: str
    frequency: Frequency
    duration: Decimal | None
    duration_unit: DurationUnit | None
    times_per_period: int | None
    employees_count: int | None
    workload_note: str | None
    workload_hours_month: Decimal | None
    first_viewed_at: datetime | None
    decided_at: datetime | None
    closed_at: datetime | None
    documents: list[DocumentOut]
    events: list[EventOut]
    actions: list[ActionOut]
    can_comment: bool


class DraftOut(BaseModel):
    request_id: uuid.UUID | None
    data: dict
    version: int
    updated_at: datetime
    documents: list[DocumentOut]


class NotificationOut(OutputModel):
    id: int
    request_id: uuid.UUID
    request_number: str
    text: str
    created_at: datetime
    read_at: datetime | None


class NotificationPage(BaseModel):
    items: list[NotificationOut]
    unread: int


class CalendarDayOut(OutputModel):
    day: date
    is_working: bool
    note: str | None
