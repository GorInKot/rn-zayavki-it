"""Производственный календарь РФ: рабочие дни с учётом праздников и переносов."""

from datetime import date, timedelta

from sqlalchemy import select
from sqlalchemy.orm import Session

from app.models import CalendarDay

# Нерабочие праздничные дни по ст. 112 ТК РФ. Используются, только если год не заполнен в календаре:
# без постановления о переносах точный график неизвестен, но праздники хотя бы не считаются рабочими.
STATUTORY_HOLIDAYS = {(1, 1), (1, 2), (1, 3), (1, 4), (1, 5), (1, 6), (1, 7), (1, 8), (2, 23), (3, 8), (5, 1), (5, 9), (6, 12), (11, 4)}


class BusinessCalendar:
    def __init__(self, overrides: dict[date, bool], filled_years: set[int]):
        self.overrides = overrides
        self.filled_years = filled_years

    @classmethod
    def load(cls, db: Session) -> "BusinessCalendar":
        rows = db.execute(select(CalendarDay.day, CalendarDay.is_working)).all()
        overrides = {row.day: row.is_working for row in rows}
        return cls(overrides, {day.year for day in overrides})

    def is_filled(self, year: int) -> bool:
        return year in self.filled_years

    def is_working(self, day: date) -> bool:
        if day in self.overrides:
            return self.overrides[day]
        if day.weekday() >= 5:
            return False
        if day.year not in self.filled_years and (day.month, day.day) in STATUTORY_HOLIDAYS:
            return False
        return True

    def add_business_days(self, start: date, days: int) -> date:
        """Дата, наступающая через `days` рабочих дней после `start` (сам `start` не считается)."""
        current = start
        added = 0
        while added < days:
            current += timedelta(days=1)
            if self.is_working(current):
                added += 1
        return current

    def business_days_between(self, start: date, end: date) -> int:
        """Сколько рабочих дней в интервале (start, end]. Отрицательное значение — end раньше start."""
        if end == start:
            return 0
        sign = 1 if end > start else -1
        low, high = (start, end) if sign == 1 else (end, start)
        count = 0
        current = low
        while current < high:
            current += timedelta(days=1)
            if self.is_working(current):
                count += 1
        return sign * count
