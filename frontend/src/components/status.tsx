import type { RequestDetail, RequestStatus, Sla } from "../api/types";
import { formatDay, plural } from "../lib/format";
import { BUSINESS_DAYS, STATUS_LABELS } from "../lib/labels";

export function StatusBadge({ status, large }: { status: RequestStatus; large?: boolean }) {
  return <span className={`badge badge--${status}${large ? " badge--large" : ""}`}>{STATUS_LABELS[status]}</span>;
}

export function slaText(sla: Sla): string | null {
  const left = sla.business_days_left;
  switch (sla.state) {
    case "overdue":
      return `Срок истёк ${plural(Math.max(1, -(left ?? 1)), BUSINESS_DAYS)} назад`;
    case "due_soon":
      return left === 0 ? "Срок рассмотрения — сегодня" : "Остался 1 рабочий день";
    case "ok":
      return `Осталось ${plural(left ?? 0, BUSINESS_DAYS)}`;
    case "paused":
      return "Срок на паузе: ждём ответа заявителя";
    default:
      return null;
  }
}

export function SlaChip({ sla, withDate }: { sla: Sla; withDate?: boolean }) {
  const text = slaText(sla);
  if (!text || !sla.state) return null;
  return (
    <span className={`chip chip--${sla.state}`}>
      {text}
      {withDate && sla.review_due_date ? ` (до ${formatDay(sla.review_due_date)})` : ""}
    </span>
  );
}

const STAGES: { status: RequestStatus; label: string }[] = [
  { status: "review", label: "На рассмотрении" },
  { status: "accepted", label: "Принята в работу" },
  { status: "development", label: "В разработке" },
  { status: "testing", label: "Тестирование" },
  { status: "done", label: "Готово" },
  { status: "closed", label: "Закрыта" },
];

function stageIndex(status: RequestStatus | null): number {
  if (status === "clarification") return 0;
  return STAGES.findIndex((stage) => stage.status === status);
}

/** Путь заявки. Для отклонённой и отозванной показывает, на каком этапе она остановилась. */
export function Lifecycle({ request }: { request: RequestDetail }) {
  const stopped = request.status === "rejected" || request.status === "withdrawn";
  let reached: number;
  if (stopped) {
    const stopEvent = [...request.events].reverse().find((event) => event.to_status === request.status);
    reached = Math.max(0, stageIndex(stopEvent?.from_status ?? "review"));
  } else {
    reached = stageIndex(request.status);
  }

  const items = [{ label: "Подана", state: "done" as const }];
  STAGES.forEach((stage, index) => {
    if (stopped && index > reached) return;
    const isFinal = request.status === "closed" && index === STAGES.length - 1;
    const state = index < reached || isFinal ? "done" : index === reached ? (stopped ? "done" : "current") : "todo";
    items.push({ label: stage.label, state: state as "done" });
  });
  if (stopped) {
    items.push({ label: STATUS_LABELS[request.status], state: "stopped" as "done" });
  }

  const describe = { done: "пройдено", current: "текущий этап", todo: "впереди", stopped: "заявка остановлена" } as const;
  return (
    <>
      <ol className="lifecycle" aria-label="Путь заявки">
        {items.map((item, index) => {
          const state = item.state as keyof typeof describe;
          return (
            <li
              key={`${item.label}-${index}`}
              className={`lifecycle__step lifecycle__step--${state === "todo" ? "muted" : state}`}
              aria-current={state === "current" ? "step" : undefined}
            >
              <span className="lifecycle__mark">
                {state === "done" ? "✓ " : state === "stopped" ? "✕ " : ""}
                {item.label}
              </span>
              <span className="visually-hidden"> — {describe[state]}</span>
            </li>
          );
        })}
      </ol>
      {request.status === "clarification" && (
        <div className="alert alert--warning" style={{ marginTop: 14 }}>
          <div className="alert__body">
            <div className="alert__title">Требуется уточнение</div>
            Срок рассмотрения остановлен до ответа заявителя. После дополнения заявка снова уйдёт на рассмотрение.
          </div>
        </div>
      )}
    </>
  );
}
