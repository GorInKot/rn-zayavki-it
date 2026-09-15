"""Демонстрационные данные для разработки и показа.

    python -m app.seed           наполнить базу, если заявок ещё нет
    python -m app.seed --reset   удалить все заявки и создать демо-набор заново

Заявки проходят через те же сервисы, что и в работе системы, поэтому история, сроки
и уведомления у них настоящие — просто «сегодня» для каждого шага сдвинуто в прошлое.
"""

import argparse
import sys
from contextlib import contextmanager
from datetime import date, datetime, time, timedelta, timezone
from decimal import Decimal
from zoneinfo import ZoneInfo

from sqlalchemy import func, select, text
from sqlalchemy.dialects.postgresql import insert

from app import timeutil
from app.auth import DEV_USERS
from app.config import get_settings
from app.db import SessionLocal
from app.models import Region, Request, Topic, User
from app.schemas import AssignmentInput, CommentInput, RequestInput, TransitionInput, WithdrawInput
from app.services import requests as service

ADMIN_LOGIN = "s.orlov"
USER_REGIONS = {"d.kovalev": "Филиал Тюмень", "g.ahmetova": "Филиал Уфа", "a.nikitin": "Филиал Красноярск"}
USER_PHONES = {
    "o.smirnova": "+7 912 345-67-89",
    "d.kovalev": "+7 922 111-22-33",
    "g.ahmetova": "+7 987 654-32-10 доб. 214",
    "i.titov": "+7 903 222-44-55",
    "m.fedorova": "4417",
    "a.nikitin": "+7 923 555-66-77",
}

SCENARIOS = [
    {
        "author": "o.smirnova", "days_ago": 0, "topic": "Экономика",
        "process": "Ежемесячно экономист вручную собирает данные о фактических затратах из пяти отчётов в Excel, которые присылают разные подразделения, и сводит их в единую таблицу.",
        "problem": "Сведение занимает много времени, при копировании часто возникают ошибки, подразделения присылают файлы в разных форматах.",
        "desired_result": "Подразделения загружают отчёты в единую форму, а система автоматически формирует сводную таблицу затрат.",
        "beneficiaries": "Отдел экономики и планирования, финансовый департамент.",
        "result_recipient": "Начальник отдела экономики и планирования",
        "workload": ("month", "3", "hours", 5, 1),
        "steps": [],
    },
    {
        "author": "d.kovalev", "days_ago": 9, "topic": "Транспорт",
        "process": "Диспетчер распределяет заявки на транспорт между водителями по телефону и записывает их в блокнот.",
        "problem": "Нет единого журнала заявок, сложно отследить загрузку машин, часто случаются накладки по времени.",
        "desired_result": "Заявки на транспорт подаются через единую форму, система показывает свободные машины и отправляет водителю задание.",
        "beneficiaries": "Водители, диспетчерская служба, подразделения — заказчики транспорта.",
        "result_recipient": "Начальник транспортного участка",
        "workload": ("day", "40", "minutes", 1, 2),
        "steps": [],
    },
    {
        "author": "g.ahmetova", "days_ago": 6, "topic": "Кадры", "type": "upgrade", "existing_system_name": "Модуль кадрового учёта «HR-Portal»",
        "process": "Сотрудники подают заявления на отпуск на бумаге, кадровик вручную переносит данные в систему учёта.",
        "problem": "На перенос бумажных заявлений уходит много времени, отдельные документы теряются.",
        "desired_result": "Сотрудник подаёт заявление через форму, кадровик только подтверждает его в системе.",
        "method_suggestion": "Доработать существующий модуль «HR-Portal»: добавить форму заявления и маршрут согласования.",
        "beneficiaries": "Сотрудники филиала, отдел кадров.",
        "result_recipient": "Начальник отдела кадров",
        "workload": ("week", "25", "minutes", 4, 1),
        "steps": [
            ("view", 5),
            ("transition", 2, "clarification", {"comment": "Приложите, пожалуйста, пример текущего бумажного заявления и уточните, кто согласует заявку."}),
        ],
    },
    {
        "author": "i.titov", "days_ago": 22, "topic": "Закупки",
        "process": "Заявки на закупку материалов приходят по почте от разных подразделений в свободной форме.",
        "problem": "Сложно отследить статус заявки, теряются вложения, нет единого реестра закупок.",
        "desired_result": "Единая форма заявки на закупку с автоматическим реестром и статусами обработки.",
        "beneficiaries": "Подразделения, инициирующие закупки, отдел закупок.",
        "result_recipient": "Начальник отдела закупок",
        "workload": ("week", "5", "hours", 1, 2),
        "steps": [
            ("transition", 17, "accepted", {"comment": "Принято, ориентировочный срок указан.", "responsible": "Группа развития информационных систем", "deadline_in": 18}),
            ("comment", 15, ADMIN_LOGIN, "Сколько в среднем заявок на закупку в месяц?", False),
            ("comment", 14, "i.titov", "Около 60, в конце квартала — до 120.", False),
            ("comment", 13, ADMIN_LOGIN, "Нужна интеграция с 1С — уточнить у бухгалтерии формат выгрузки.", True),
            ("transition", 4, "development", {"comment": "Начата разработка формы заявки на закупку."}),
        ],
    },
    {
        "author": "m.fedorova", "days_ago": 40, "topic": "ПБОТОС",
        "process": "Журнал инструктажей по охране труда ведётся на бумаге отдельно на каждом участке.",
        "problem": "Сложно контролировать сроки повторных инструктажей, данные не сводятся в общую картину.",
        "desired_result": "Система напоминает о сроках инструктажей и хранит единый электронный журнал.",
        "beneficiaries": "Специалисты по охране труда, руководители участков.",
        "result_recipient": "Главный специалист по охране труда",
        "workload": ("week", "2", "hours", 1, 3),
        "steps": [
            ("transition", 35, "accepted", {"responsible": "Группа развития информационных систем", "deadline_in": 5}),
            ("transition", 25, "development", {}),
            ("transition", 8, "testing", {"comment": "Передано на тестирование специалистам по охране труда."}),
            ("transition", 1, "done", {"comment": "Тестирование завершено, решение готово к использованию."}),
        ],
    },
    {
        "author": "a.nikitin", "days_ago": 15, "topic": "АХО",
        "process": "Заявки на канцелярские товары подаются кладовщику устно.",
        "problem": "Забывают, что заказывали, нет истории расхода материалов.",
        "desired_result": "Электронная форма заказа канцелярии.",
        "beneficiaries": "Сотрудники филиала.",
        "result_recipient": "Заведующий хозяйством",
        "workload": ("month", "15", "minutes", 2, 1),
        "steps": [
            ("view", 14),
            ("transition", 12, "rejected", {"comment": "Трудоёмкость процесса невелика, автоматизация сейчас нецелесообразна. Рекомендуем вести учёт в общей таблице подразделения."}),
        ],
    },
    {
        "author": "o.smirnova", "days_ago": 62, "topic": "Делопроизводство",
        "process": "Входящие письма регистрируются в журнале Excel, резолюции руководителя переписываются вручную.",
        "problem": "Журнал ведут одновременно три человека, файл регулярно ломается, сроки исполнения никто не контролирует.",
        "desired_result": "Электронный журнал входящей корреспонденции с напоминаниями о сроках исполнения.",
        "beneficiaries": "Канцелярия, руководители подразделений.",
        "result_recipient": "Заведующий канцелярией",
        "workload": ("day", "1.5", "hours", 1, 3),
        "steps": [
            ("transition", 58, "accepted", {"responsible": "Группа развития информационных систем", "deadline_in": -20}),
            ("transition", 50, "development", {}),
            ("assign", 40, {"responsible": "Подрядчик ООО «ИнфоСистемы»", "deadline_in": -15, "comment": "Разработку передали подрядчику."}),
            ("transition", 30, "testing", {}),
            ("transition", 22, "done", {}),
            ("transition", 18, "closed", {"comment": "Решение внедрено во всех подразделениях головного офиса."}),
        ],
    },
    {
        "author": "d.kovalev", "days_ago": 3, "topic": "Оборудование",
        "process": "Показания счётчиков моточасов техники переписываются с приборов на бумагу и раз в неделю вносятся в таблицу.",
        "problem": "Ошибки при переписывании, сроки ТО считаются с опозданием.",
        "desired_result": "Показания вводятся с планшета, сроки ТО рассчитываются автоматически.",
        "beneficiaries": "Механики, служба главного механика.",
        "result_recipient": "Главный механик",
        "workload": ("week", "3", "hours", 1, 1),
        "steps": [("withdraw", 1, "Вопрос решили закупкой готового решения у поставщика техники.")],
    },
    {
        "author": "g.ahmetova", "days_ago": 4, "topic": "Другое", "topic_other": "Социальные программы",
        "process": "Заявления на материальную помощь принимаются на бумаге и передаются в профсоюзный комитет курьером.",
        "problem": "Рассмотрение затягивается на несколько недель, заявитель не знает, на каком этапе его заявление.",
        "desired_result": "Заявление подаётся онлайн, заявитель видит статус рассмотрения.",
        "beneficiaries": "Сотрудники филиала, профсоюзный комитет.",
        "result_recipient": "Председатель профсоюзного комитета",
        "workload": ("irregular", None, None, None, None, "Около 20 заявлений в квартал, на каждое уходит до часа на пересылку и сверку."),
        "steps": [("view", 3)],
    },
    {
        "author": "i.titov", "days_ago": 12, "topic": "Планирование",
        "process": "План закупок на год собирается из заявок подразделений вручную в нескольких версиях файла.",
        "problem": "Версии расходятся, итоговый план приходится сверять построчно.",
        "desired_result": "Подразделения вносят потребности в общую систему, план собирается автоматически.",
        "beneficiaries": "Отдел закупок, планово-экономический отдел.",
        "result_recipient": "Заместитель директора по экономике",
        "workload": ("year", "10", "days", 1, 2),
        "steps": [("transition", 7, "accepted", {"responsible": "Группа развития информационных систем", "deadline_in": 45})],
    },
]


@contextmanager
def clock(real_today: date, days_ago: int, hour: int = 10):
    tz = ZoneInfo(get_settings().timezone)
    moment = datetime.combine(real_today - timedelta(days=days_ago), time(hour), tzinfo=tz).astimezone(timezone.utc)
    saved = timeutil.utcnow, timeutil.local_now, timeutil.local_today
    timeutil.utcnow = lambda: moment
    timeutil.local_now = lambda: moment.astimezone(tz)
    timeutil.local_today = lambda: moment.astimezone(tz).date()
    try:
        yield
    finally:
        timeutil.utcnow, timeutil.local_now, timeutil.local_today = saved


def ensure_users(db) -> dict[str, User]:
    regions = {region.name: region.id for region in db.scalars(select(Region))}
    for login, (full_name, email, department, is_admin) in DEV_USERS.items():
        values = {"login": login, "full_name": full_name, "email": email, "department": department, "is_admin": is_admin}
        db.execute(insert(User).values(**values).on_conflict_do_update(index_elements=[User.login], set_=values))
    db.commit()
    users = {user.login: user for user in db.scalars(select(User).where(User.login.in_(DEV_USERS)))}
    for login, user in users.items():
        user.last_region_id = regions[USER_REGIONS.get(login, "Головной офис")]
    db.commit()
    return users


def build_input(db, scenario: dict, user: User) -> RequestInput:
    topics = {topic.name: topic.id for topic in db.scalars(select(Topic))}
    frequency, duration, unit, times, employees, *note = scenario["workload"]
    return RequestInput(
        applicant={"phone": USER_PHONES[user.login], "department": user.department, "region_id": user.last_region_id},
        type=scenario.get("type", "new"),
        existing_system_name=scenario.get("existing_system_name"),
        topic_id=topics[scenario["topic"]],
        topic_other=scenario.get("topic_other"),
        process=scenario["process"],
        problem=scenario["problem"],
        desired_result=scenario["desired_result"],
        method_suggestion=scenario.get("method_suggestion"),
        beneficiaries=scenario["beneficiaries"],
        result_recipient=scenario["result_recipient"],
        workload={
            "frequency": frequency,
            "duration": Decimal(duration) if duration else None,
            "duration_unit": unit,
            "times_per_period": times,
            "employees_count": employees,
            "note": note[0] if note else None,
        },
        consent=True,
    )


def seed(reset: bool) -> None:
    settings = get_settings()
    if settings.environment == "production":
        sys.exit("Демо-данные нельзя загружать при ENVIRONMENT=production.")

    real_today = timeutil.local_today()
    with SessionLocal() as db:
        existing = db.scalar(select(func.count()).select_from(Request))
        if existing and not reset:
            print(f"В базе уже есть заявки ({existing}). Для пересоздания запустите с --reset.")
            return
        if reset:
            db.execute(text("TRUNCATE notifications, request_events, request_documents, drafts, requests, request_counters RESTART IDENTITY CASCADE"))
            db.commit()

        users = ensure_users(db)
        admin = users[ADMIN_LOGIN]
        for scenario in sorted(SCENARIOS, key=lambda s: -s["days_ago"]):
            author = users[scenario["author"]]
            with clock(real_today, scenario["days_ago"], hour=9):
                request = service.create_request(db, author, build_input(db, scenario, author))
            request_id = request.id

            for step in scenario["steps"]:
                kind, days_ago, *args = step
                current = db.get(Request, request_id, populate_existing=True)
                with clock(real_today, days_ago, hour=11 + scenario["steps"].index(step) % 5):
                    if kind == "view":
                        service.get_detail(db, request_id, admin)
                    elif kind == "transition":
                        to_status, options = args
                        options = dict(options)
                        if "deadline_in" in options:
                            options["deadline"] = real_today + timedelta(days=options.pop("deadline_in"))
                        service.transition_request(db, admin, request_id, TransitionInput(to_status=to_status, version=current.version, **options))
                    elif kind == "assign":
                        options = dict(args[0])
                        options["deadline"] = real_today + timedelta(days=options.pop("deadline_in"))
                        service.change_assignment(db, admin, request_id, AssignmentInput(version=current.version, **options))
                    elif kind == "comment":
                        login, body, internal = args
                        service.add_comment(db, users[login], request_id, CommentInput(text=body, is_internal=internal))
                    elif kind == "withdraw":
                        service.withdraw_request(db, author, request_id, WithdrawInput(comment=args[0], version=current.version))

        db.execute(
            text(
                "UPDATE requests r SET updated_at = COALESCE((SELECT max(e.created_at) FROM request_events e WHERE e.request_id = r.id), r.created_at)"
            )
        )
        # Старые уведомления демо-набора считаем прочитанными, кроме последней недели.
        db.execute(text("UPDATE notifications SET read_at = created_at + interval '1 hour' WHERE created_at < now() - interval '7 days'"))
        db.commit()
        total = db.scalar(select(func.count()).select_from(Request))
        print(f"Создано демо-заявок: {total}. Пользователи для входа в режиме dev: {', '.join(DEV_USERS)}")


if __name__ == "__main__":
    parser = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    parser.add_argument("--reset", action="store_true", help="удалить существующие заявки и создать демо-набор заново")
    seed(parser.parse_args().reset)
