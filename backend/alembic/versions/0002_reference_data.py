"""reference data: regions, topics, production calendar 2025–2026

Revision ID: 0002
Revises: 0001
"""
from collections.abc import Sequence
from datetime import date

import sqlalchemy as sa
from alembic import op

revision: str = "0002"
down_revision: str | None = "0001"
branch_labels: str | Sequence[str] | None = None
depends_on: str | Sequence[str] | None = None

REGIONS = ["Головной офис", "Филиал Тюмень", "Филиал Красноярск", "Филиал Уфа"]
TOPICS = ["Производство", "Планирование", "Экономика", "Кадры", "Делопроизводство", "Транспорт", "АХО", "Закупки", "ПБОТОС", "Оборудование"]

# Производственный календарь по постановлениям Правительства РФ о переносе выходных.
# Перечислены только отклонения от пятидневки: нерабочие будни и рабочие выходные.
# Перед вводом в эксплуатацию сверить с официальным текстом постановления.
CALENDAR = [
    # 2025 (постановление № 1335 от 04.10.2024)
    ("2025-01-01", False, "Новогодние каникулы"), ("2025-01-02", False, "Новогодние каникулы"),
    ("2025-01-03", False, "Новогодние каникулы"), ("2025-01-06", False, "Новогодние каникулы"),
    ("2025-01-07", False, "Рождество Христово"), ("2025-01-08", False, "Новогодние каникулы"),
    ("2025-05-01", False, "Праздник Весны и Труда"), ("2025-05-02", False, "Перенос с 4 января"),
    ("2025-05-08", False, "Перенос с 23 февраля"), ("2025-05-09", False, "День Победы"),
    ("2025-06-12", False, "День России"), ("2025-06-13", False, "Перенос с 8 марта"),
    ("2025-11-01", True, "Рабочая суббота"), ("2025-11-03", False, "Перенос с 1 ноября"),
    ("2025-11-04", False, "День народного единства"), ("2025-12-31", False, "Перенос с 5 января"),
    # 2026
    ("2026-01-01", False, "Новогодние каникулы"), ("2026-01-02", False, "Новогодние каникулы"),
    ("2026-01-05", False, "Новогодние каникулы"), ("2026-01-06", False, "Новогодние каникулы"),
    ("2026-01-07", False, "Рождество Христово"), ("2026-01-08", False, "Новогодние каникулы"),
    ("2026-01-09", False, "Перенос с 3 января"), ("2026-02-23", False, "День защитника Отечества"),
    ("2026-03-09", False, "Перенос с 8 марта"), ("2026-05-01", False, "Праздник Весны и Труда"),
    ("2026-05-11", False, "Перенос с 9 мая"), ("2026-06-12", False, "День России"),
    ("2026-11-04", False, "День народного единства"), ("2026-12-31", False, "Перенос с 4 января"),
]


def upgrade() -> None:
    regions = sa.table("regions", sa.column("name", sa.String), sa.column("sort_order", sa.Integer))
    op.bulk_insert(regions, [{"name": name, "sort_order": i * 10} for i, name in enumerate(REGIONS)])

    topics = sa.table("topics", sa.column("name", sa.String), sa.column("sort_order", sa.Integer), sa.column("requires_detail", sa.Boolean))
    rows = [{"name": name, "sort_order": i * 10, "requires_detail": False} for i, name in enumerate(TOPICS)]
    rows.append({"name": "Другое", "sort_order": 1000, "requires_detail": True})
    op.bulk_insert(topics, rows)

    calendar = sa.table("calendar_days", sa.column("day", sa.Date), sa.column("is_working", sa.Boolean), sa.column("note", sa.String))
    op.bulk_insert(calendar, [{"day": date.fromisoformat(d), "is_working": w, "note": n} for d, w, n in CALENDAR])


def downgrade() -> None:
    op.execute("DELETE FROM calendar_days WHERE extract(year FROM day) IN (2025, 2026)")
    op.execute("DELETE FROM topics")
    op.execute("DELETE FROM regions")
