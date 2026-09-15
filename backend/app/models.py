from __future__ import annotations

import enum
import uuid
from datetime import date, datetime
from decimal import Decimal

from sqlalchemy import (
    BigInteger,
    Boolean,
    CheckConstraint,
    Computed,
    Date,
    DateTime,
    Enum as SAEnum,
    ForeignKey,
    Identity,
    Index,
    Integer,
    Numeric,
    String,
    Text,
    func,
    text,
)
from sqlalchemy.dialects.postgresql import JSONB, UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.db import Base
from app.enums import ActorRole, DurationUnit, EventKind, Frequency, RequestStatus, RequestType


def enum_column(enum_cls: type[enum.Enum], name: str) -> SAEnum:
    # Строка + CHECK вместо нативного enum PostgreSQL: новое значение добавляется обычной миграцией.
    return SAEnum(
        enum_cls,
        name=name,
        native_enum=False,
        create_constraint=True,
        length=32,
        validate_strings=True,
        values_callable=lambda cls: [member.value for member in cls],
    )


class TimestampMixin:
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class User(TimestampMixin, Base):
    """Сотрудник. Создаётся и обновляется автоматически по данным из AD при каждом входе через портал."""

    __tablename__ = "users"

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    login: Mapped[str] = mapped_column(String(256), unique=True)
    full_name: Mapped[str] = mapped_column(String(256))
    email: Mapped[str | None] = mapped_column(String(320))
    department: Mapped[str | None] = mapped_column(String(256))
    is_admin: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    # Последние введённые значения — подставляются в новую заявку.
    last_phone: Mapped[str | None] = mapped_column(String(64))
    last_region_id: Mapped[int | None] = mapped_column(ForeignKey("regions.id"))
    last_seen_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())


class Region(Base):
    __tablename__ = "regions"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))


class Topic(Base):
    __tablename__ = "topics"

    id: Mapped[int] = mapped_column(Integer, Identity(), primary_key=True)
    name: Mapped[str] = mapped_column(String(128), unique=True)
    sort_order: Mapped[int] = mapped_column(Integer, server_default=text("0"))
    is_active: Mapped[bool] = mapped_column(Boolean, server_default=text("true"))
    requires_detail: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))


class CalendarDay(Base):
    """Отклонение от обычной пятидневки: праздник или перенесённый выходной (is_working=false),
    либо рабочая суббота/воскресенье (is_working=true). Год считается заполненным, если в нём есть хоть одна запись."""

    __tablename__ = "calendar_days"

    day: Mapped[date] = mapped_column(Date, primary_key=True)
    is_working: Mapped[bool] = mapped_column(Boolean)
    note: Mapped[str | None] = mapped_column(String(256))


class RequestCounter(Base):
    __tablename__ = "request_counters"

    year: Mapped[int] = mapped_column(Integer, primary_key=True)
    last_value: Mapped[int] = mapped_column(Integer)


class Request(TimestampMixin, Base):
    __tablename__ = "requests"
    __table_args__ = (
        CheckConstraint("type <> 'upgrade' OR existing_system_name IS NOT NULL", name="upgrade_has_system"),
        CheckConstraint("duration IS NULL OR duration > 0", name="duration_positive"),
        CheckConstraint("times_per_period IS NULL OR times_per_period > 0", name="times_positive"),
        CheckConstraint("employees_count IS NULL OR employees_count > 0", name="employees_positive"),
        Index("ix_requests_search_trgm", "search_text", postgresql_using="gin", postgresql_ops={"search_text": "gin_trgm_ops"}),
        Index("ix_requests_status_created", "status", "created_at"),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    number: Mapped[str] = mapped_column(String(32), unique=True)
    status: Mapped[RequestStatus] = mapped_column(enum_column(RequestStatus, "request_status"), index=True)
    author_id: Mapped[int] = mapped_column(ForeignKey("users.id"), index=True)

    # Данные заявителя на момент подачи — не меняются, если сотрудник потом переведётся.
    applicant_name: Mapped[str] = mapped_column(String(256))
    applicant_email: Mapped[str | None] = mapped_column(String(320))
    applicant_phone: Mapped[str] = mapped_column(String(64))
    applicant_department: Mapped[str] = mapped_column(String(256))
    region_id: Mapped[int] = mapped_column(ForeignKey("regions.id"), index=True)

    type: Mapped[RequestType] = mapped_column(enum_column(RequestType, "request_type"))
    existing_system_name: Mapped[str | None] = mapped_column(String(500))
    topic_id: Mapped[int] = mapped_column(ForeignKey("topics.id"), index=True)
    topic_other: Mapped[str | None] = mapped_column(String(200))

    process: Mapped[str] = mapped_column(Text)
    problem: Mapped[str] = mapped_column(Text)
    desired_result: Mapped[str] = mapped_column(Text)
    method_suggestion: Mapped[str | None] = mapped_column(Text)
    beneficiaries: Mapped[str] = mapped_column(Text)
    result_recipient: Mapped[str] = mapped_column(Text)

    frequency: Mapped[Frequency] = mapped_column(enum_column(Frequency, "frequency"))
    duration: Mapped[Decimal | None] = mapped_column(Numeric(10, 2))
    duration_unit: Mapped[DurationUnit | None] = mapped_column(enum_column(DurationUnit, "duration_unit"))
    times_per_period: Mapped[int | None] = mapped_column(Integer)
    employees_count: Mapped[int | None] = mapped_column(Integer)
    workload_note: Mapped[str | None] = mapped_column(Text)
    workload_hours_month: Mapped[Decimal | None] = mapped_column(Numeric(14, 2))

    responsible: Mapped[str | None] = mapped_column(String(256))
    deadline: Mapped[date | None] = mapped_column(Date)

    consent_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    submitted_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    review_due_date: Mapped[date | None] = mapped_column(Date)
    first_viewed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    decided_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    closed_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))

    search_text: Mapped[str] = mapped_column(
        Text,
        Computed(
            "lower(number || ' ' || applicant_name || ' ' || applicant_department || ' ' || "
            "coalesce(existing_system_name, '') || ' ' || coalesce(topic_other, '') || ' ' || "
            "coalesce(responsible, '') || ' ' || process || ' ' || problem || ' ' || desired_result)",
            persisted=True,
        ),
    )

    author: Mapped[User] = relationship(foreign_keys=[author_id])
    region: Mapped[Region] = relationship()
    topic: Mapped[Topic] = relationship()
    documents: Mapped[list[RequestDocument]] = relationship(
        back_populates="request", order_by="RequestDocument.created_at", foreign_keys="RequestDocument.request_id"
    )
    events: Mapped[list[RequestEvent]] = relationship(back_populates="request", order_by="RequestEvent.id")


class Draft(Base):
    """Черновик новой заявки (request_id IS NULL) или ответа на запрос уточнения. Хранится на сервере."""

    __tablename__ = "drafts"
    __table_args__ = (
        Index("uq_drafts_new_per_user", "user_id", unique=True, postgresql_where=text("request_id IS NULL")),
        Index("uq_drafts_user_request", "user_id", "request_id", unique=True, postgresql_where=text("request_id IS NOT NULL")),
    )

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    request_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"))
    data: Mapped[dict] = mapped_column(JSONB, server_default=text("'{}'::jsonb"))
    version: Mapped[int] = mapped_column(Integer, server_default=text("1"))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())


class RequestDocument(Base):
    __tablename__ = "request_documents"
    __table_args__ = (CheckConstraint("request_id IS NOT NULL OR draft_id IS NOT NULL", name="has_owner"),)

    id: Mapped[uuid.UUID] = mapped_column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    request_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"), index=True)
    draft_id: Mapped[uuid.UUID | None] = mapped_column(ForeignKey("drafts.id", ondelete="CASCADE"), index=True)
    uploaded_by: Mapped[int] = mapped_column(ForeignKey("users.id"))
    original_name: Mapped[str] = mapped_column(String(255))
    extension: Mapped[str] = mapped_column(String(16))
    content_type: Mapped[str] = mapped_column(String(128))
    size_bytes: Mapped[int] = mapped_column(BigInteger)
    storage_key: Mapped[str] = mapped_column(String(64), unique=True)
    usage: Mapped[str | None] = mapped_column(Text)
    future_use: Mapped[str | None] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[Request | None] = relationship(back_populates="documents", foreign_keys=[request_id])


class RequestEvent(Base):
    """История заявки и журнал аудита: кто, когда и что сделал."""

    __tablename__ = "request_events"
    __table_args__ = (Index("ix_request_events_request_created", "request_id", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"))
    kind: Mapped[EventKind] = mapped_column(enum_column(EventKind, "event_kind"))
    from_status: Mapped[RequestStatus | None] = mapped_column(enum_column(RequestStatus, "event_from_status"))
    to_status: Mapped[RequestStatus | None] = mapped_column(enum_column(RequestStatus, "event_to_status"))
    comment: Mapped[str | None] = mapped_column(Text)
    is_internal: Mapped[bool] = mapped_column(Boolean, server_default=text("false"))
    actor_id: Mapped[int | None] = mapped_column(ForeignKey("users.id"))
    actor_name: Mapped[str] = mapped_column(String(256))
    actor_role: Mapped[ActorRole] = mapped_column(enum_column(ActorRole, "actor_role"))
    payload: Mapped[dict | None] = mapped_column(JSONB)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())

    request: Mapped[Request] = relationship(back_populates="events")


class Notification(Base):
    __tablename__ = "notifications"
    __table_args__ = (Index("ix_notifications_user_unread", "user_id", "read_at", "created_at"),)

    id: Mapped[int] = mapped_column(BigInteger, Identity(), primary_key=True)
    user_id: Mapped[int] = mapped_column(ForeignKey("users.id", ondelete="CASCADE"))
    request_id: Mapped[uuid.UUID] = mapped_column(ForeignKey("requests.id", ondelete="CASCADE"))
    event_id: Mapped[int | None] = mapped_column(ForeignKey("request_events.id", ondelete="CASCADE"))
    text: Mapped[str] = mapped_column(Text)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    read_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))

    request: Mapped[Request] = relationship()
