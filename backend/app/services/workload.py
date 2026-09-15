from decimal import ROUND_HALF_UP, Decimal

from app.enums import DurationUnit, Frequency

UNIT_HOURS = {DurationUnit.minutes: Decimal(1) / Decimal(60), DurationUnit.hours: Decimal(1), DurationUnit.days: Decimal(8)}

# Сколько периодов в среднем месяце. 21 — среднее число рабочих дней в месяце.
PERIODS_PER_MONTH = {
    Frequency.day: Decimal(21),
    Frequency.week: Decimal(52) / Decimal(12),
    Frequency.month: Decimal(1),
    Frequency.quarter: Decimal(1) / Decimal(3),
    Frequency.year: Decimal(1) / Decimal(12),
}


def hours_per_month(
    frequency: Frequency,
    duration: Decimal | None,
    unit: DurationUnit | None,
    times_per_period: int | None,
    employees_count: int | None,
) -> Decimal | None:
    """Трудоёмкость в человеко-часах в месяц. None — оценить нельзя (нерегулярный процесс или нет данных)."""
    if frequency == Frequency.irregular or None in (duration, unit, times_per_period, employees_count):
        return None
    total = Decimal(duration) * UNIT_HOURS[unit] * times_per_period * employees_count * PERIODS_PER_MONTH[frequency]
    return total.quantize(Decimal("0.01"), rounding=ROUND_HALF_UP)
