"""Жизненный цикл заявки: какие переходы возможны, кому и с какими условиями."""

from dataclasses import dataclass
from typing import Literal

from app.enums import RequestStatus as S

REVIEW_PHASE = {S.review, S.clarification}
IN_WORK = {S.accepted, S.development, S.testing}
ASSIGNABLE = IN_WORK
APPLICANT_WITHDRAWABLE = REVIEW_PHASE
LIFECYCLE_ORDER = [S.review, S.clarification, S.accepted, S.development, S.testing, S.done, S.closed, S.rejected, S.withdrawn]


@dataclass(frozen=True)
class Transition:
    to: S
    label: str
    comment_required: bool = False
    needs_assignment: bool = False
    tone: Literal["primary", "secondary", "danger"] = "secondary"


# Переходы администратора. Возвраты назад и отмены требуют комментария — он виден заявителю и остаётся в истории.
ADMIN_TRANSITIONS: dict[S, list[Transition]] = {
    S.review: [
        Transition(S.accepted, "Принять в работу", needs_assignment=True, tone="primary"),
        Transition(S.clarification, "Запросить уточнение", comment_required=True),
        Transition(S.rejected, "Отклонить", comment_required=True, tone="danger"),
    ],
    S.clarification: [
        Transition(S.accepted, "Принять в работу без уточнения", needs_assignment=True, tone="primary"),
        Transition(S.review, "Отменить запрос уточнения", comment_required=True),
        Transition(S.rejected, "Отклонить", comment_required=True, tone="danger"),
    ],
    S.accepted: [
        Transition(S.development, "Начать разработку", tone="primary"),
        Transition(S.rejected, "Отменить реализацию", comment_required=True, tone="danger"),
    ],
    S.development: [
        Transition(S.testing, "Передать на тестирование", tone="primary"),
        Transition(S.accepted, "Вернуть в «Принята в работу»", comment_required=True),
        Transition(S.rejected, "Отменить реализацию", comment_required=True, tone="danger"),
    ],
    S.testing: [
        Transition(S.done, "Отметить как готовую", tone="primary"),
        Transition(S.development, "Вернуть в разработку", comment_required=True),
    ],
    S.done: [
        Transition(S.closed, "Закрыть заявку", tone="primary"),
        Transition(S.testing, "Вернуть на тестирование", comment_required=True),
    ],
    S.rejected: [
        Transition(S.review, "Возобновить рассмотрение", comment_required=True, tone="primary"),
    ],
    S.closed: [],
    S.withdrawn: [],
}


def find_transition(current: S, target: S) -> Transition | None:
    return next((t for t in ADMIN_TRANSITIONS.get(current, []) if t.to == target), None)
