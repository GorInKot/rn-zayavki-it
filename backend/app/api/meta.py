from fastapi import APIRouter, Depends
from sqlalchemy import func, select, text
from sqlalchemy.orm import Session

from app.auth import DEV_USERS, get_current_user
from app.config import get_settings
from app.db import get_db
from app.enums import DURATION_UNIT_LABELS, FREQUENCY_LABELS, REQUEST_TYPE_LABELS, STATUS_LABELS
from app.models import Notification, Region, Topic, User
from app.schemas import ApplicantDefaults, DictionariesOut, MeOut, Option, RegionOut, TopicOut, UserOut

router = APIRouter()


@router.get("/health", include_in_schema=False)
def health(db: Session = Depends(get_db)) -> dict:
    db.execute(text("SELECT 1"))
    return {"status": "ok"}


@router.get("/me", response_model=MeOut)
def me(user: User = Depends(get_current_user), db: Session = Depends(get_db)) -> MeOut:
    settings = get_settings()
    unread = db.scalar(select(func.count()).where(Notification.user_id == user.id, Notification.read_at.is_(None)))
    dev_users = None
    if settings.auth_mode == "dev":
        dev_users = [{"login": login, "full_name": name, "is_admin": admin} for login, (name, _, _, admin) in DEV_USERS.items()]
    return MeOut(
        user=UserOut.model_validate(user),
        auth_mode=settings.auth_mode,
        unread_notifications=unread,
        applicant_defaults=ApplicantDefaults(
            full_name=user.full_name, email=user.email, phone=user.last_phone, department=user.department, region_id=user.last_region_id
        ),
        dev_users=dev_users,
    )


@router.get("/dictionaries", response_model=DictionariesOut)
def dictionaries(db: Session = Depends(get_db), _: User = Depends(get_current_user)) -> DictionariesOut:
    settings = get_settings()
    regions = db.scalars(select(Region).where(Region.is_active.is_(True)).order_by(Region.sort_order, Region.name))
    topics = db.scalars(select(Topic).where(Topic.is_active.is_(True)).order_by(Topic.sort_order, Topic.name))
    return DictionariesOut(
        regions=[RegionOut.model_validate(r) for r in regions],
        topics=[TopicOut.model_validate(t) for t in topics],
        statuses=[Option(value=k.value, label=v) for k, v in STATUS_LABELS.items()],
        request_types=[Option(value=k.value, label=v) for k, v in REQUEST_TYPE_LABELS.items()],
        frequencies=[Option(value=k.value, label=v) for k, v in FREQUENCY_LABELS.items()],
        duration_units=[Option(value=k.value, label=v) for k, v in DURATION_UNIT_LABELS.items()],
        max_upload_mb=settings.max_upload_mb,
        max_files_per_request=settings.max_files_per_request,
        allowed_extensions=sorted(settings.allowed_extensions_set),
        review_business_days=settings.review_business_days,
    )
