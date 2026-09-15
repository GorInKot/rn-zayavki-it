from collections import Counter
from datetime import date

from sqlalchemy import func, select
from sqlalchemy.orm import Session

from app import timeutil
from app.config import get_settings
from app.enums import STATUS_GROUPS, RequestStatus
from app.models import Region, Request, Topic
from app.services.calendar import BusinessCalendar
from app.services.workflow import IN_WORK


def _month_start(value: date, months_back: int) -> date:
    month_index = value.year * 12 + value.month - 1 - months_back
    return date(month_index // 12, month_index % 12 + 1, 1)


def build_dashboard(db: Session) -> dict:
    settings = get_settings()
    today = timeutil.local_today()
    calendar = BusinessCalendar.load(db)

    by_status = dict(db.execute(select(Request.status, func.count()).group_by(Request.status)).all())
    total = sum(by_status.values())
    groups = [
        {"key": key, "label": label, "count": sum(by_status.get(status, 0) for status in statuses), "statuses": [s.value for s in statuses]}
        for key, (label, statuses) in STATUS_GROUPS.items()
    ]

    in_review = Request.status == RequestStatus.review
    soon_limit = calendar.add_business_days(today, 1)
    attention = {
        "unviewed": db.scalar(select(func.count()).where(in_review, Request.first_viewed_at.is_(None))),
        "overdue": db.scalar(select(func.count()).where(in_review, Request.review_due_date < today)),
        "due_soon": db.scalar(select(func.count()).where(in_review, Request.review_due_date >= today, Request.review_due_date <= soon_limit)),
    }

    by_topic = [
        {"label": label, "count": count}
        for label, count in db.execute(
            select(Topic.name, func.count()).select_from(Request).join(Topic, Request.topic_id == Topic.id).group_by(Topic.name).order_by(func.count().desc(), Topic.name)
        ).all()
    ]
    by_region = [
        {"label": label, "count": count}
        for label, count in db.execute(
            select(Region.name, func.count()).select_from(Request).join(Region, Request.region_id == Region.id).group_by(Region.name).order_by(func.count().desc(), Region.name)
        ).all()
    ]

    first_month = _month_start(today, 11)
    local_month = func.date_trunc("month", func.timezone(settings.timezone, Request.submitted_at))
    monthly = Counter(
        {
            month.date(): count
            for month, count in db.execute(
                select(local_month, func.count()).where(func.timezone(settings.timezone, Request.submitted_at) >= first_month).group_by(local_month)
            ).all()
        }
    )
    by_month = [{"month": _month_start(today, back).isoformat(), "count": monthly.get(_month_start(today, back), 0)} for back in range(11, -1, -1)]

    decided = db.execute(select(Request.submitted_at, Request.decided_at).where(Request.decided_at.is_not(None))).all()
    decision_days = [
        max(0, calendar.business_days_between(timeutil.to_local(row.submitted_at).date(), timeutil.to_local(row.decided_at).date())) for row in decided
    ]
    decision = {
        "count": len(decision_days),
        "avg_business_days": round(sum(decision_days) / len(decision_days), 1) if decision_days else None,
        "on_time_share": round(100 * sum(1 for d in decision_days if d <= settings.review_business_days) / len(decision_days)) if decision_days else None,
    }

    active_statuses = [RequestStatus.review, RequestStatus.clarification, *IN_WORK]
    active_count = sum(by_status.get(status, 0) for status in active_statuses)
    workload_rows = db.execute(
        select(func.count(Request.workload_hours_month), func.sum(Request.workload_hours_month)).where(Request.status.in_(active_statuses))
    ).one()
    with_estimate, hours_sum = workload_rows
    workload = {
        "active_requests": active_count,
        "with_estimate": with_estimate,
        "total_hours_month": float(hours_sum) if hours_sum is not None else None,
    }

    missing_calendar_years = [year for year in (today.year, today.year + 1) if not calendar.is_filled(year) and (year == today.year or today.month >= 11)]

    return {
        "today": today.isoformat(),
        "total": total,
        "groups": groups,
        "attention": attention,
        "by_topic": by_topic,
        "by_region": by_region,
        "by_month": by_month,
        "decision": decision,
        "workload": workload,
        "missing_calendar_years": missing_calendar_years,
        "review_business_days": settings.review_business_days,
    }
