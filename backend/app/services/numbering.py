from sqlalchemy.dialects.postgresql import insert
from sqlalchemy.orm import Session

from app.models import RequestCounter


def next_request_number(db: Session, year: int) -> str:
    """Номер выдаётся атомарно в той же транзакции, что и создание заявки: без повторов и без «сожжённых» номеров."""
    stmt = (
        insert(RequestCounter)
        .values(year=year, last_value=1)
        .on_conflict_do_update(index_elements=[RequestCounter.year], set_={"last_value": RequestCounter.last_value + 1})
        .returning(RequestCounter.last_value)
    )
    value = db.execute(stmt).scalar_one()
    return f"AUT-{year}-{value:06d}"
