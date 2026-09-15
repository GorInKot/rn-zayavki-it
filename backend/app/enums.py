import enum


class RequestStatus(str, enum.Enum):
    review = "review"
    clarification = "clarification"
    accepted = "accepted"
    development = "development"
    testing = "testing"
    done = "done"
    closed = "closed"
    rejected = "rejected"
    withdrawn = "withdrawn"


STATUS_LABELS: dict[RequestStatus, str] = {
    RequestStatus.review: "На рассмотрении",
    RequestStatus.clarification: "Требуется уточнение",
    RequestStatus.accepted: "Принята в работу",
    RequestStatus.development: "В разработке",
    RequestStatus.testing: "Тестирование",
    RequestStatus.done: "Готово",
    RequestStatus.closed: "Закрыта",
    RequestStatus.rejected: "Отклонена",
    RequestStatus.withdrawn: "Отозвана заявителем",
}

# Группы для дашборда: каждая заявка попадает ровно в одну — сумма плиток равна общему числу.
STATUS_GROUPS: dict[str, tuple[str, list[RequestStatus]]] = {
    "review": ("На рассмотрении", [RequestStatus.review]),
    "clarification": ("Ждут ответа заявителя", [RequestStatus.clarification]),
    "in_work": ("В работе", [RequestStatus.accepted, RequestStatus.development, RequestStatus.testing]),
    "finished": ("Готово и закрыто", [RequestStatus.done, RequestStatus.closed]),
    "rejected": ("Отклонены", [RequestStatus.rejected]),
    "withdrawn": ("Отозваны", [RequestStatus.withdrawn]),
}


class RequestType(str, enum.Enum):
    new = "new"
    upgrade = "upgrade"


REQUEST_TYPE_LABELS = {
    RequestType.new: "Новая автоматизация",
    RequestType.upgrade: "Доработка существующей автоматизации",
}


class Frequency(str, enum.Enum):
    day = "day"
    week = "week"
    month = "month"
    quarter = "quarter"
    year = "year"
    irregular = "irregular"


FREQUENCY_LABELS = {
    Frequency.day: "в день",
    Frequency.week: "в неделю",
    Frequency.month: "в месяц",
    Frequency.quarter: "в квартал",
    Frequency.year: "в год",
    Frequency.irregular: "нерегулярно",
}


class DurationUnit(str, enum.Enum):
    minutes = "minutes"
    hours = "hours"
    days = "days"


DURATION_UNIT_LABELS = {
    DurationUnit.minutes: "минут",
    DurationUnit.hours: "часов",
    DurationUnit.days: "рабочих дней (по 8 ч)",
}


class EventKind(str, enum.Enum):
    submitted = "submitted"
    status_changed = "status_changed"
    resubmitted = "resubmitted"
    withdrawn = "withdrawn"
    comment = "comment"
    assignment_changed = "assignment_changed"


class ActorRole(str, enum.Enum):
    applicant = "applicant"
    admin = "admin"
    system = "system"
