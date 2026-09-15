import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Link, useLocation, useNavigate, useParams } from "react-router";

import { api, ApiError, download } from "../api/client";
import { useMe, useRequestDetail } from "../api/hooks";
import type { RequestAction, RequestDetail, RequestEvent } from "../api/types";
import { Dialog } from "../components/Dialog";
import { Checkbox, TextArea, TextInput } from "../components/fields";
import { Empty, ErrorState, Loading } from "../components/states";
import { Lifecycle, SlaChip, StatusBadge } from "../components/status";
import { useToast } from "../components/Toasts";
import { fileSize, formatDateTime, formatDay, formatHours, todayIso } from "../lib/format";
import { FREQUENCY_LABELS, STATUS_LABELS, TYPE_LABELS, UNIT_OPTIONS } from "../lib/labels";
import { useTitle } from "../lib/useTitle";

type DialogState = { kind: "transition"; action: RequestAction } | { kind: "assign" } | { kind: "withdraw" } | null;

export function RequestPage() {
  const { id } = useParams();
  const location = useLocation();
  const navigate = useNavigate();
  const me = useMe();
  const query = useRequestDetail(id);
  const [dialog, setDialog] = useState<DialogState>(null);
  const flash = (location.state as { flash?: string } | null)?.flash;
  useTitle(query.data ? `Заявка ${query.data.number}` : "Заявка");

  if (query.isPending || !me.data) return <Loading label="Загружаем заявку…" />;
  if (query.isError) {
    if (query.error instanceof ApiError && query.error.status === 404)
      return (
        <div className="page page--narrow">
          <Empty title="Заявка не найдена" action={<Link className="btn btn--primary" to="/">На главную</Link>}>
            Возможно, ссылка неверная или у вас нет доступа к этой заявке.
          </Empty>
        </div>
      );
    return (
      <div className="page page--narrow">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    );
  }

  const request = query.data;
  const user = me.data.user;
  const isAuthor = request.author_id === user.id;
  const backTo = user.is_admin && !isAuthor ? "/admin/registry" : "/requests";

  return (
    <div className="page">
      <Link to={backTo} className="back-link">
        ← {user.is_admin && !isAuthor ? "Реестр заявок" : "Мои заявки"}
      </Link>

      {flash && (
        <div className="alert alert--success" role="status" style={{ marginBottom: 16 }}>
          <div className="alert__body">
            <div className="alert__title">
              {flash === "created" ? `Заявка ${request.number} зарегистрирована` : `Заявка ${request.number} дополнена и снова отправлена на рассмотрение`}
            </div>
            {request.review_due_date && `Её рассмотрят до ${formatDay(request.review_due_date)}. О решении придёт уведомление в системе.`}
          </div>
          <button type="button" className="btn btn--ghost btn--small" onClick={() => navigate(location.pathname, { replace: true, state: null })}>
            Скрыть
          </button>
        </div>
      )}

      <div className="page-head">
        <div>
          <h1>
            Заявка <span className="mono">{request.number}</span>
          </h1>
          <p className="page-head__sub">
            Подана {formatDateTime(request.submitted_at)} · {request.applicant_name} · {request.topic_name}
          </p>
        </div>
        <div className="row">
          <StatusBadge status={request.status} large />
          <button type="button" className="btn btn--secondary btn--small no-print" onClick={() => window.print()}>
            Распечатать
          </button>
        </div>
      </div>

      <section className="card" aria-labelledby="lifecycle-title">
        <h2 id="lifecycle-title" className="card__title" style={{ marginBottom: 10 }}>
          Путь заявки
        </h2>
        <Lifecycle request={request} />
      </section>

      {request.actions.length > 0 && (
        <div className="actions-bar" role="group" aria-label="Действия с заявкой">
          {request.actions.map((action) => (
            <button
              key={`${action.kind}-${action.to_status ?? ""}`}
              type="button"
              className={`btn btn--${action.tone}`}
              onClick={() => {
                if (action.kind === "resubmit") navigate(`/requests/${request.id}/edit`);
                else if (action.kind === "withdraw") setDialog({ kind: "withdraw" });
                else if (action.kind === "assign") setDialog({ kind: "assign" });
                else setDialog({ kind: "transition", action });
              }}
            >
              {action.label}
            </button>
          ))}
        </div>
      )}

      <div className="detail" style={{ marginTop: request.actions.length ? 0 : 16 }}>
        <div className="stack">
          <RequestContent request={request} />
        </div>
        <aside className="stack">
          <DeadlinesCard request={request} />
          <Conversation request={request} isAdmin={user.is_admin} />
        </aside>
      </div>

      {dialog?.kind === "transition" && <TransitionDialog request={request} action={dialog.action} onClose={() => setDialog(null)} />}
      {dialog?.kind === "assign" && <AssignmentDialog request={request} onClose={() => setDialog(null)} />}
      {dialog?.kind === "withdraw" && <WithdrawDialog request={request} onClose={() => setDialog(null)} />}
    </div>
  );
}

function Facts({ items }: { items: [string, React.ReactNode][] }) {
  return (
    <dl className="facts">
      {items.map(([label, value]) => (
        <div key={label} style={{ display: "contents" }}>
          <dt>{label}</dt>
          <dd>{value || "—"}</dd>
        </div>
      ))}
    </dl>
  );
}

function TextBlock({ title, text }: { title: string; text: string | null }) {
  if (!text) return null;
  return (
    <>
      <h3>{title}</h3>
      <p className="prewrap section-text" style={{ marginBottom: 16 }}>
        {text}
      </p>
    </>
  );
}

function RequestContent({ request }: { request: RequestDetail }) {
  const toast = useToast();
  const unit = UNIT_OPTIONS.find((item) => item.value === request.duration_unit)?.label;
  const hours = request.workload_hours_month !== null ? Number(request.workload_hours_month) : null;

  return (
    <>
      <section className="card" aria-labelledby="applicant-title">
        <h2 id="applicant-title" className="card__title" style={{ marginBottom: 12 }}>
          Заявитель
        </h2>
        <Facts
          items={[
            ["ФИО", request.applicant_name],
            ["Подразделение", request.applicant_department],
            ["Регион", request.region_name],
            ["Телефон", request.applicant_phone],
            ["Почта", request.applicant_email ? <a href={`mailto:${request.applicant_email}`}>{request.applicant_email}</a> : null],
          ]}
        />
      </section>

      <section className="card" aria-labelledby="subject-title">
        <h2 id="subject-title" className="card__title" style={{ marginBottom: 12 }}>
          Суть заявки
        </h2>
        <Facts
          items={[
            ["Тип", TYPE_LABELS[request.type]],
            ...(request.type === "upgrade" ? ([["Существующая система", request.existing_system_name]] as [string, string | null][]) : []),
            ["Тематика", request.topic_name],
          ]}
        />
        <div style={{ marginTop: 18 }}>
          <TextBlock title="Как процесс выполняется сейчас" text={request.process} />
          <TextBlock title="Что требует автоматизации" text={request.problem} />
          <TextBlock title="Желаемый результат" text={request.desired_result} />
          <TextBlock title="Предложения по способу автоматизации" text={request.method_suggestion} />
          <TextBlock title="Кто получит выгоду" text={request.beneficiaries} />
          <TextBlock title="Кто получает результат" text={request.result_recipient} />
        </div>
      </section>

      <section className="card" aria-labelledby="workload-title">
        <h2 id="workload-title" className="card__title" style={{ marginBottom: 12 }}>
          Трудоёмкость
        </h2>
        <Facts
          items={[
            ["Периодичность", FREQUENCY_LABELS[request.frequency]],
            ...(request.frequency !== "irregular"
              ? ([
                  ["Одна операция", request.duration ? `${Number(request.duration).toLocaleString("ru-RU")} ${unit ?? ""}` : null],
                  ["Повторений", request.times_per_period ? `${request.times_per_period} ${FREQUENCY_LABELS[request.frequency]}` : null],
                  ["Сотрудников", request.employees_count],
                  ["Оценка", hours !== null ? `около ${formatHours(hours)} человеко-часов в месяц` : null],
                ] as [string, React.ReactNode][])
              : []),
            ["Дополнительно", request.workload_note ? <span className="prewrap">{request.workload_note}</span> : null],
          ]}
        />
      </section>

      <section className="card" aria-labelledby="documents-title">
        <h2 id="documents-title" className="card__title" style={{ marginBottom: 12 }}>
          Документы
        </h2>
        {request.documents.length === 0 ? (
          <p className="muted">Документы не приложены.</p>
        ) : (
          <ul className="files" style={{ marginTop: 0 }}>
            {request.documents.map((document) => (
              <li key={document.id} className="file">
                <div className="file__head">
                  <span className="file__ext" aria-hidden="true">
                    {document.extension}
                  </span>
                  <div className="file__meta">
                    <div className="file__name">{document.original_name}</div>
                    <div className="small muted">{fileSize(document.size_bytes)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--secondary btn--small no-print"
                    onClick={() =>
                      download(`/documents/${document.id}/download`, document.original_name).catch((error: unknown) =>
                        toast(error instanceof ApiError ? error.message : "Не удалось скачать файл", "error"),
                      )
                    }
                  >
                    Скачать<span className="visually-hidden"> «{document.original_name}»</span>
                  </button>
                </div>
                {(document.usage || document.future_use) && (
                  <div className="file__body small">
                    {document.usage && (
                      <p>
                        <span className="muted">Что используется: </span>
                        <span className="prewrap">{document.usage}</span>
                      </p>
                    )}
                    {document.future_use && (
                      <p style={{ marginTop: 4 }}>
                        <span className="muted">После автоматизации: </span>
                        <span className="prewrap">{document.future_use}</span>
                      </p>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  );
}

function DeadlinesCard({ request }: { request: RequestDetail }) {
  const inReview = request.status === "review" || request.status === "clarification";
  const items: [string, React.ReactNode][] = [];
  if (inReview) {
    items.push([
      "Рассмотреть до",
      request.status === "clarification" ? (
        <SlaChip sla={request.sla} />
      ) : (
        <>
          {formatDay(request.review_due_date)}
          <br />
          <SlaChip sla={request.sla} />
        </>
      ),
    ]);
  }
  if (request.decided_at) items.push(["Решение принято", formatDateTime(request.decided_at)]);
  if (request.responsible) items.push(["Ответственный", request.responsible]);
  if (request.deadline)
    items.push([
      "Срок реализации",
      <>
        {formatDay(request.deadline)}
        <br />
        <span className="small muted">Ориентировочный, может уточняться</span>
      </>,
    ]);
  if (request.closed_at) items.push([request.status === "withdrawn" ? "Отозвана" : "Закрыта", formatDateTime(request.closed_at)]);
  items.push(["Последнее изменение", formatDateTime(request.updated_at)]);

  return (
    <section className="card" aria-labelledby="deadlines-title">
      <h2 id="deadlines-title" className="card__title" style={{ marginBottom: 12 }}>
        Сроки и ответственный
      </h2>
      <Facts items={items} />
    </section>
  );
}

function describeEvent(event: RequestEvent): string {
  const payload = event.payload ?? {};
  switch (event.kind) {
    case "submitted":
      return "Заявка подана";
    case "resubmitted": {
      const changed = (payload.changed as string[] | undefined) ?? [];
      const files = (payload.files as string[] | undefined) ?? [];
      const details = [changed.length ? `изменено: ${changed.join(", ")}` : null, ...files].filter(Boolean);
      return `Заявка дополнена и отправлена повторно${details.length ? ` (${details.join("; ")})` : ""}`;
    }
    case "withdrawn":
      return "Заявка отозвана заявителем";
    case "status_changed": {
      const from = event.from_status ? STATUS_LABELS[event.from_status] : "—";
      const to = event.to_status ? STATUS_LABELS[event.to_status] : "—";
      const assignment = payload.responsible ? `. Ответственный: ${payload.responsible}, срок: ${formatDay(payload.deadline as string)}` : "";
      return `Статус: «${from}» → «${to}»${assignment}`;
    }
    case "assignment_changed": {
      const parts: string[] = [];
      const responsible = payload.responsible as [string | null, string] | undefined;
      const deadline = payload.deadline as [string | null, string] | undefined;
      if (responsible) parts.push(`ответственный: ${responsible[0] ?? "—"} → ${responsible[1]}`);
      if (deadline) parts.push(`срок: ${formatDay(deadline[0])} → ${formatDay(deadline[1])}`);
      return `Изменено: ${parts.join("; ")}`;
    }
    case "comment":
      return event.is_internal ? "Служебная заметка" : "Комментарий";
  }
}

const ROLE_LABELS = { applicant: "заявитель", admin: "администратор", system: "система" } as const;

function Conversation({ request, isAdmin }: { request: RequestDetail; isAdmin: boolean }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const [text, setText] = useState("");
  const [internal, setInternal] = useState(false);
  const [error, setError] = useState<string | undefined>();

  const mutation = useMutation({
    mutationFn: () => api(`/requests/${request.id}/comments`, { method: "POST", body: { text: text.trim(), is_internal: internal } }),
    onSuccess: () => {
      setText("");
      setInternal(false);
      toast(internal ? "Служебная заметка сохранена" : "Комментарий отправлен");
      void queryClient.invalidateQueries({ queryKey: ["request", request.id] });
    },
    onError: (mutationError) => setError(mutationError instanceof ApiError ? mutationError.message : "Не удалось отправить комментарий"),
  });

  return (
    <section className="card" aria-labelledby="history-title">
      <h2 id="history-title" className="card__title" style={{ marginBottom: 12 }}>
        История и обсуждение
      </h2>
      {request.can_comment && (
        <form
          className="no-print"
          noValidate
          style={{ marginBottom: 12 }}
          onSubmit={(event) => {
            event.preventDefault();
            if (!text.trim()) {
              setError("Напишите комментарий");
              return;
            }
            setError(undefined);
            mutation.mutate();
          }}
        >
          <TextArea
            id="comment-text"
            label="Комментарий"
            rows={3}
            maxLength={4000}
            hint={internal ? "Заметку увидят только администраторы" : isAdmin ? "Заявитель увидит комментарий и получит уведомление" : "Администраторы увидят комментарий и получат уведомление"}
            value={text}
            error={error}
            onChange={(value) => {
              setText(value);
              setError(undefined);
            }}
          />
          {isAdmin && (
            <div style={{ marginTop: 10 }}>
              <Checkbox id="comment-internal" label="Служебная заметка — не показывать заявителю" checked={internal} onChange={setInternal} />
            </div>
          )}
          <button type="submit" className="btn btn--secondary btn--small" style={{ marginTop: 10 }} disabled={mutation.isPending}>
            {mutation.isPending ? "Отправляем…" : internal ? "Сохранить заметку" : "Отправить комментарий"}
          </button>
        </form>
      )}
      <ol className="timeline" reversed>
        {[...request.events].reverse().map((event) => (
          <li key={event.id} className={`timeline__item${event.is_internal ? " timeline__item--internal" : ""}`}>
            <div className="timeline__head">
              <span className="timeline__who">{event.actor_name}</span>
              <span className="small muted">{ROLE_LABELS[event.actor_role]}</span>
              <time className="timeline__when" dateTime={event.created_at}>
                {formatDateTime(event.created_at)}
              </time>
            </div>
            <div style={{ marginTop: 2 }}>{describeEvent(event)}</div>
            {event.comment && <div className="timeline__comment prewrap">{event.comment}</div>}
          </li>
        ))}
      </ol>
    </section>
  );
}

function useRequestMutation(request: RequestDetail) {
  const queryClient = useQueryClient();
  return useMutation({
    mutationFn: ({ path, method, body }: { path: string; method: "POST" | "PUT"; body: unknown }) =>
      api<RequestDetail>(`/requests/${request.id}${path}`, { method, body }),
    onSuccess: (data) => {
      queryClient.setQueryData(["request", request.id], data);
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
    },
  });
}

function MutationError({ error, request }: { error: unknown; request: RequestDetail }) {
  const queryClient = useQueryClient();
  if (!error || (error instanceof ApiError && error.errors.length)) return null;
  const stale = error instanceof ApiError && (error.code === "stale_version" || error.code === "invalid_transition");
  return (
    <div className="alert alert--danger" role="alert" style={{ marginTop: 14 }}>
      <div className="alert__body">{error instanceof ApiError ? error.message : "Не удалось выполнить действие"}</div>
      {stale && (
        <button type="button" className="btn btn--secondary btn--small" onClick={() => void queryClient.invalidateQueries({ queryKey: ["request", request.id] })}>
          Обновить данные
        </button>
      )}
    </div>
  );
}

function fieldErrors(error: unknown): Record<string, string> {
  if (!(error instanceof ApiError)) return {};
  return Object.fromEntries(error.errors.map((item) => [item.path, item.message]));
}

const TRANSITION_HINTS: Partial<Record<string, string>> = {
  clarification: "Заявитель получит уведомление и сможет дополнить заявку. Срок рассмотрения остановится до его ответа.",
  rejected: "Заявка будет отклонена. Причину увидит заявитель; позже заявку можно возобновить.",
  accepted: "Укажите ответственного и ориентировочный срок — их увидит заявитель.",
  review: "Заявка вернётся на рассмотрение, срок рассмотрения начнётся заново.",
};

function TransitionDialog({ request, action, onClose }: { request: RequestDetail; action: RequestAction; onClose: () => void }) {
  const toast = useToast();
  const mutation = useRequestMutation(request);
  const [comment, setComment] = useState("");
  const [responsible, setResponsible] = useState(request.responsible ?? "");
  const [deadline, setDeadline] = useState(request.deadline ?? "");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const target = action.to_status!;
  const serverErrors = fieldErrors(mutation.error);
  const shown = { ...serverErrors, ...errors };

  function submit() {
    const next: Record<string, string> = {};
    if (action.comment_required && !comment.trim()) next.comment = target === "clarification" ? "Опишите, что нужно уточнить" : "Укажите причину — заявитель увидит этот комментарий";
    if (action.needs_assignment) {
      if (!responsible.trim()) next.responsible = "Укажите ответственного сотрудника или команду";
      if (!deadline) next.deadline = "Укажите ориентировочный срок реализации";
      else if (deadline < todayIso()) next.deadline = "Срок не может быть в прошлом";
    }
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate(
      {
        path: "/transitions",
        method: "POST",
        body: {
          to_status: target,
          comment: comment.trim() || null,
          responsible: action.needs_assignment ? responsible.trim() : null,
          deadline: action.needs_assignment ? deadline : null,
          version: request.version,
        },
      },
      {
        onSuccess: () => {
          toast(`Статус заявки ${request.number} изменён на «${STATUS_LABELS[target]}»`);
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open
      title={action.label}
      description={TRANSITION_HINTS[target] ?? "Заявитель получит уведомление о смене статуса."}
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className={`btn btn--${action.tone === "danger" ? "danger" : "primary"}`} disabled={mutation.isPending}>
            {mutation.isPending ? "Сохраняем…" : action.label}
          </button>
        </>
      }
    >
      <div className="stack">
        {action.needs_assignment && (
          <div className="field-grid">
            <TextInput id="transition-responsible" label="Ответственный" required value={responsible} error={shown.responsible} onChange={setResponsible} />
            <TextInput id="transition-deadline" label="Срок реализации" required type="date" min={todayIso()} value={deadline} error={shown.deadline} onChange={setDeadline} />
          </div>
        )}
        <TextArea
          id="transition-comment"
          label={action.comment_required ? (target === "clarification" ? "Что нужно уточнить" : "Причина") : "Комментарий для заявителя"}
          required={action.comment_required}
          optional={!action.comment_required}
          rows={4}
          maxLength={4000}
          value={comment}
          error={shown.comment}
          onChange={setComment}
        />
      </div>
      <MutationError error={mutation.error} request={request} />
    </Dialog>
  );
}

function AssignmentDialog({ request, onClose }: { request: RequestDetail; onClose: () => void }) {
  const toast = useToast();
  const mutation = useRequestMutation(request);
  const [responsible, setResponsible] = useState(request.responsible ?? "");
  const [deadline, setDeadline] = useState(request.deadline ?? "");
  const [comment, setComment] = useState("");
  const [errors, setErrors] = useState<Record<string, string>>({});
  const shown = { ...fieldErrors(mutation.error), ...errors };

  function submit() {
    const next: Record<string, string> = {};
    if (!responsible.trim()) next.responsible = "Укажите ответственного";
    if (!deadline) next.deadline = "Укажите срок";
    else if (deadline < todayIso()) next.deadline = "Срок не может быть в прошлом";
    else if (deadline === request.deadline && responsible.trim() === request.responsible) next.deadline = "Срок и ответственный не изменились";
    setErrors(next);
    if (Object.keys(next).length) return;
    mutation.mutate(
      { path: "/assignment", method: "PUT", body: { responsible: responsible.trim(), deadline, comment: comment.trim() || null, version: request.version } },
      {
        onSuccess: () => {
          toast("Срок и ответственный обновлены, заявитель получил уведомление");
          onClose();
        },
      },
    );
  }

  return (
    <Dialog
      open
      title="Изменить срок или ответственного"
      description="Изменение попадёт в историю заявки, заявитель получит уведомление."
      onClose={onClose}
      onSubmit={submit}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={mutation.isPending}>
            {mutation.isPending ? "Сохраняем…" : "Сохранить"}
          </button>
        </>
      }
    >
      <div className="stack">
        <div className="field-grid">
          <TextInput id="assign-responsible" label="Ответственный" required value={responsible} error={shown.responsible} onChange={setResponsible} />
          <TextInput id="assign-deadline" label="Срок реализации" required type="date" min={todayIso()} value={deadline} error={shown.deadline} onChange={setDeadline} />
        </div>
        <TextArea id="assign-comment" label="Причина изменения" optional rows={3} maxLength={4000} value={comment} onChange={setComment} />
      </div>
      <MutationError error={mutation.error} request={request} />
    </Dialog>
  );
}

function WithdrawDialog({ request, onClose }: { request: RequestDetail; onClose: () => void }) {
  const toast = useToast();
  const mutation = useRequestMutation(request);
  const [comment, setComment] = useState("");

  return (
    <Dialog
      open
      title="Отозвать заявку?"
      description="Рассмотрение прекратится, вернуть заявку будет нельзя. При необходимости подайте новую."
      onClose={onClose}
      onSubmit={() =>
        mutation.mutate(
          { path: "/withdraw", method: "POST", body: { comment: comment.trim() || null, version: request.version } },
          {
            onSuccess: () => {
              toast(`Заявка ${request.number} отозвана`);
              onClose();
            },
          },
        )
      }
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Не отзывать
          </button>
          <button type="submit" className="btn btn--danger" disabled={mutation.isPending}>
            {mutation.isPending ? "Отзываем…" : "Отозвать заявку"}
          </button>
        </>
      }
    >
      <TextArea id="withdraw-comment" label="Причина" optional rows={3} maxLength={4000} value={comment} onChange={setComment} />
      <MutationError error={mutation.error} request={request} />
    </Dialog>
  );
}
