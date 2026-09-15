import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useMemo, useRef, useState } from "react";
import { Link, useBlocker, useNavigate, useParams } from "react-router";

import { api, ApiError } from "../../api/client";
import { useDictionaries, useMe, useRequestDetail } from "../../api/hooks";
import type { Dictionaries, DocumentInfo, Draft, Me, RequestDetail } from "../../api/types";
import { Dialog } from "../../components/Dialog";
import { focusField } from "../../components/fields";
import { Empty, ErrorState, Loading } from "../../components/states";
import { useToast } from "../../components/Toasts";
import { formatDateTime, plural } from "../../lib/format";
import {
  emptyForm,
  FIELD_NAMES,
  fieldId,
  formFromRequest,
  restoreForm,
  setPath,
  STEP_TITLES,
  stepOfPath,
  toPayload,
  validateAll,
  validateStep,
  type Errors,
  type Mode,
  type RequestForm,
} from "../../lib/requestForm";
import { useTitle } from "../../lib/useTitle";
import { ApplicantStep, DescriptionStep, ReviewStep, SubjectStep, WorkloadStep } from "./steps";
import { useAutosave, type SaveState } from "./useAutosave";

export function WizardRoute({ mode }: { mode: Mode }) {
  const { id } = useParams();
  return <WizardPage key={mode === "new" ? "new" : id} mode={mode} requestId={id} />;
}

function WizardPage({ mode, requestId }: { mode: Mode; requestId?: string }) {
  const draftKey = mode === "new" ? "new" : requestId!;
  useTitle(mode === "new" ? "Новая заявка" : "Дополнение заявки");
  const me = useMe();
  const dictionaries = useDictionaries();
  const request = useRequestDetail(mode === "clarification" ? requestId : undefined);
  const draft = useQuery({
    queryKey: ["draft", draftKey],
    queryFn: async () => {
      try {
        return await api<Draft>(`/drafts/${draftKey}`);
      } catch (error) {
        if (error instanceof ApiError && (error.code === "no_draft" || error.code === "not_clarification")) return null;
        throw error;
      }
    },
    staleTime: Infinity,
    gcTime: 0,
    refetchOnWindowFocus: false,
  });

  const pending = me.isPending || dictionaries.isPending || draft.isPending || (mode === "clarification" && request.isPending);
  const error = me.error ?? dictionaries.error ?? draft.error ?? request.error;
  if (error) {
    return (
      <div className="page page--narrow">
        <ErrorState error={error} onRetry={() => window.location.reload()} />
      </div>
    );
  }
  if (pending || !me.data || !dictionaries.data) return <Loading label="Открываем форму…" />;

  if (mode === "clarification" && request.data && request.data.status !== "clarification") {
    return (
      <div className="page page--narrow">
        <Empty title="Заявка уже не ждёт уточнения" action={<Link className="btn btn--primary" to={`/requests/${requestId}`}>Открыть заявку</Link>}>
          Возможно, вы уже отправили дополнение или администратор изменил статус.
        </Empty>
      </div>
    );
  }

  return (
    <WizardForm
      mode={mode}
      draftKey={draftKey}
      me={me.data}
      dictionaries={dictionaries.data}
      request={request.data ?? null}
      draft={draft.data ?? null}
    />
  );
}

interface FormProps {
  mode: Mode;
  draftKey: string;
  me: Me;
  dictionaries: Dictionaries;
  request: RequestDetail | null;
  draft: Draft | null;
}

function hasContent(data: unknown): boolean {
  return Boolean(data && typeof data === "object" && Object.keys(data).length > 0);
}

function WizardForm({ mode, draftKey, me, dictionaries, request, draft }: FormProps) {
  const navigate = useNavigate();
  const toast = useToast();
  const queryClient = useQueryClient();

  const initial = useMemo(() => {
    const base = request ? formFromRequest(request) : emptyForm(me);
    return draft && hasContent(draft.data) ? restoreForm(draft.data, base) : base;
  }, [draft, me, request]);
  const initialDocuments = draft?.documents ?? request?.documents ?? [];

  const [form, setForm] = useState<RequestForm>(initial);
  const [documentsMeta, setDocumentsMeta] = useState<Record<string, DocumentInfo>>(() => Object.fromEntries(initialDocuments.map((doc) => [doc.id, doc])));
  const [step, setStep] = useState(0);
  const [maxStep, setMaxStep] = useState(mode === "clarification" ? STEP_TITLES.length - 1 : 0);
  const [errors, setErrors] = useState<Errors>({});
  const [summaryVisible, setSummaryVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<ApiError | null>(null);
  const [discardOpen, setDiscardOpen] = useState(false);
  const [restoredAt, setRestoredAt] = useState(draft && hasContent(draft.data) ? draft.updated_at : null);
  const submitted = useRef(false);
  const heading = useRef<HTMLHeadingElement>(null);
  const summary = useRef<HTMLDivElement>(null);

  const attachedToRequest = useMemo(() => new Set(request?.documents.map((doc) => doc.id) ?? []), [request]);
  const autosave = useAutosave(draftKey, form, draft && hasContent(draft.data) ? draft.version : null);

  const blocker = useBlocker(({ currentLocation, nextLocation }) => !submitted.current && currentLocation.pathname !== nextLocation.pathname && autosave.hasUnsaved());

  useEffect(() => {
    if (summaryVisible) summary.current?.focus();
  }, [summaryVisible, errors]);

  function set(path: string, value: unknown) {
    setForm((current) => setPath(current, path, value));
    setErrors((current) => {
      if (!(path in current)) return current;
      const next = { ...current };
      delete next[path];
      return next;
    });
    autosave.markDirty();
  }

  function showStep(next: number) {
    setStep(next);
    setMaxStep((current) => Math.max(current, next));
    setSummaryVisible(false);
    window.scrollTo(0, 0);
    requestAnimationFrame(() => heading.current?.focus());
  }

  function goTo(target: number) {
    if (target <= step) {
      setErrors({});
      showStep(target);
      return;
    }
    for (let current = step; current < target; current += 1) {
      const stepErrors = validateStep(current, form, dictionaries, mode);
      if (Object.keys(stepErrors).length) {
        if (current !== step) setStep(current);
        setErrors(stepErrors);
        setSummaryVisible(true);
        return;
      }
    }
    setErrors({});
    showStep(target);
  }

  async function submit() {
    const { errors: allErrors, firstStep } = validateAll(form, dictionaries, mode);
    if (firstStep !== null) {
      setStep(firstStep);
      setErrors(allErrors);
      setSummaryVisible(true);
      return;
    }
    setSubmitting(true);
    setSubmitError(null);
    try {
      const body = toPayload(form, dictionaries);
      const result =
        mode === "new"
          ? await api<RequestDetail>("/requests", { method: "POST", body })
          : await api<RequestDetail>(`/requests/${request!.id}/resubmit`, { method: "POST", body: { ...body, version: request!.version } });
      submitted.current = true;
      autosave.reset(null);
      queryClient.setQueryData(["request", result.id], result);
      void queryClient.invalidateQueries({ queryKey: ["requests"] });
      void queryClient.invalidateQueries({ queryKey: ["draft-summary"] });
      void queryClient.invalidateQueries({ queryKey: ["me"] });
      navigate(`/requests/${result.id}`, { state: { flash: mode === "new" ? "created" : "resubmitted" } });
    } catch (error) {
      if (error instanceof ApiError && error.errors.length) {
        const mapped: Errors = {};
        for (const item of error.errors) mapped[item.path.startsWith("documents") ? "documents" : item.path] = item.message;
        const target = Math.min(...Object.keys(mapped).map(stepOfPath));
        setStep(target);
        setErrors(mapped);
        setSummaryVisible(true);
      } else {
        setSubmitError(error instanceof ApiError ? error : new ApiError(0, "Не удалось отправить заявку"));
      }
    } finally {
      setSubmitting(false);
    }
  }

  async function discard() {
    try {
      await api(`/drafts/${draftKey}`, { method: "DELETE" });
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Не удалось удалить черновик", "error");
      return;
    }
    setDiscardOpen(false);
    if (mode === "clarification") {
      submitted.current = true;
      autosave.reset(null);
      toast("Изменения отменены — заявка осталась прежней");
      navigate(`/requests/${request!.id}`);
      return;
    }
    autosave.reset(null);
    setForm(emptyForm(me));
    setDocumentsMeta({});
    setErrors({});
    setRestoredAt(null);
    setMaxStep(0);
    showStep(0);
    void queryClient.invalidateQueries({ queryKey: ["draft-summary"] });
    toast("Черновик удалён. Можно начать заново");
  }

  const stepProps = { form, errors, set, dictionaries, me, mode };
  const errorEntries = Object.entries(errors);
  const clarificationQuestion = request ? [...request.events].reverse().find((event) => event.to_status === "clarification")?.comment : null;

  return (
    <div className="page page--narrow">
      {mode === "new" ? (
        <Link to="/requests" className="back-link">
          ← Мои заявки
        </Link>
      ) : (
        <Link to={`/requests/${request!.id}`} className="back-link">
          ← К заявке {request!.number}
        </Link>
      )}
      <div className="page-head">
        <div>
          <h1 ref={heading} tabIndex={-1} style={{ outline: "none" }}>
            {mode === "new" ? "Новая заявка на автоматизацию" : `Дополнение заявки ${request!.number}`}
          </h1>
          <p className="page-head__sub">
            Шаг {step + 1} из {STEP_TITLES.length}: {STEP_TITLES[step]}
          </p>
        </div>
        <SaveIndicator state={autosave.state} onRetry={() => void autosave.flush()} />
      </div>

      {restoredAt && mode === "new" && (
        <div className="alert alert--info" style={{ marginBottom: 16 }}>
          <div className="alert__body">Продолжаем черновик, сохранённый {formatDateTime(restoredAt)}.</div>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => setDiscardOpen(true)}>
            Начать заново
          </button>
        </div>
      )}
      {mode === "clarification" && clarificationQuestion && (
        <div className="alert alert--warning" style={{ marginBottom: 16 }}>
          <div className="alert__body">
            <div className="alert__title">Что просит уточнить администратор</div>
            <p className="prewrap">{clarificationQuestion}</p>
          </div>
        </div>
      )}
      {autosave.state.kind === "conflict" && (
        <div className="alert alert--danger" role="alert" style={{ marginBottom: 16 }}>
          <div className="alert__body">
            <div className="alert__title">Черновик изменён в другой вкладке</div>
            Автосохранение остановлено, чтобы не затереть более свежую версию.
          </div>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => window.location.reload()}>
            Загрузить свежую версию
          </button>
        </div>
      )}

      <ol className="steps" aria-label="Шаги заполнения">
        {STEP_TITLES.map((title, index) => {
          const state = index < step ? "done" : index === step ? "current" : "todo";
          return (
            <li key={title} className={`steps__item steps__item--${state}`} aria-current={index === step ? "step" : undefined}>
              <button type="button" className="steps__button" disabled={index > maxStep || index === step} onClick={() => goTo(index)}>
                <span className="steps__num">
                  Шаг {index + 1}
                  {state === "done" && <span className="visually-hidden">, заполнен</span>}
                </span>
                <span className="steps__name">{title}</span>
              </button>
            </li>
          );
        })}
      </ol>

      {summaryVisible && errorEntries.length > 0 && (
        <div ref={summary} tabIndex={-1} className="alert alert--danger" role="alert" style={{ marginBottom: 16 }}>
          <div className="alert__body">
            <div className="alert__title">Проверьте {plural(errorEntries.length, ["поле", "поля", "полей"])}</div>
            <ul>
              {errorEntries.map(([path, message]) => (
                <li key={path}>
                  <button type="button" className="btn--link" onClick={() => focusField(fieldId(path))}>
                    {FIELD_NAMES[path] ?? "Поле"}
                  </button>
                  : {message}
                </li>
              ))}
            </ul>
          </div>
        </div>
      )}

      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          if (step === STEP_TITLES.length - 1) void submit();
          else goTo(step + 1);
        }}
      >
        <div className="stack">
          {step === 0 && <ApplicantStep {...stepProps} />}
          {step === 1 && <SubjectStep {...stepProps} />}
          {step === 2 && <DescriptionStep {...stepProps} />}
          {step === 3 && (
            <WorkloadStep
              {...stepProps}
              draftKey={draftKey}
              documentsMeta={documentsMeta}
              attachedToRequest={attachedToRequest}
              onDocumentAdded={(document) => {
                setDocumentsMeta((current) => ({ ...current, [document.id]: document }));
                setForm((current) => ({ ...current, documents: [...current.documents, { id: document.id, usage: "", future_use: "" }] }));
                autosave.markDirty();
              }}
              onDocumentRemoved={(id) => {
                setForm((current) => ({ ...current, documents: current.documents.filter((ref) => ref.id !== id) }));
                autosave.markDirty();
              }}
            />
          )}
          {step === 4 && <ReviewStep {...stepProps} documentsMeta={documentsMeta} onEdit={(target) => goTo(target)} />}
        </div>

        {submitError && (
          <div className="alert alert--danger" role="alert" style={{ marginTop: 16 }}>
            <div className="alert__body">
              <div className="alert__title">Заявка не отправлена</div>
              {submitError.message}
            </div>
            {submitError.code === "stale_version" || submitError.code === "not_clarification" ? (
              <button type="button" className="btn btn--secondary btn--small" onClick={() => navigate(`/requests/${request?.id}`)}>
                Открыть заявку
              </button>
            ) : null}
          </div>
        )}

        <div className="wizard-bar">
          <div className="row">
            {step > 0 && (
              <button type="button" className="btn btn--secondary" onClick={() => goTo(step - 1)}>
                ← Назад
              </button>
            )}
          </div>
          <div className="row">
            <button type="button" className="btn btn--ghost" onClick={() => setDiscardOpen(true)}>
              {mode === "new" ? "Удалить черновик" : "Отменить изменения"}
            </button>
            {step < STEP_TITLES.length - 1 ? (
              <button type="submit" className="btn btn--primary">
                Далее →
              </button>
            ) : (
              <button type="submit" className="btn btn--primary" disabled={submitting}>
                {submitting ? "Отправляем…" : mode === "new" ? "Отправить заявку" : "Отправить повторно"}
              </button>
            )}
          </div>
        </div>
      </form>

      <Dialog
        open={discardOpen}
        title={mode === "new" ? "Удалить черновик?" : "Отменить изменения?"}
        description={
          mode === "new"
            ? "Все введённые данные и загруженные файлы будут удалены. Это действие нельзя отменить."
            : "Внесённые изменения и новые файлы будут удалены. Заявка останется в статусе «Требуется уточнение»."
        }
        onClose={() => setDiscardOpen(false)}
        onSubmit={() => void discard()}
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setDiscardOpen(false)}>
              Оставить
            </button>
            <button type="submit" className="btn btn--danger">
              {mode === "new" ? "Удалить черновик" : "Отменить изменения"}
            </button>
          </>
        }
      />

      <Dialog
        open={blocker.state === "blocked"}
        title="Изменения ещё не сохранены"
        description="Черновик сохраняется автоматически, но последние изменения пока не записаны."
        onClose={() => blocker.reset?.()}
        onSubmit={async () => {
          if (await autosave.flush()) blocker.proceed?.();
        }}
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => blocker.reset?.()}>
              Остаться
            </button>
            <button type="button" className="btn btn--ghost" onClick={() => blocker.proceed?.()}>
              Уйти без сохранения
            </button>
            <button type="submit" className="btn btn--primary">
              Сохранить и перейти
            </button>
          </>
        }
      />
    </div>
  );
}

function SaveIndicator({ state, onRetry }: { state: SaveState; onRetry: () => void }) {
  let content: React.ReactNode = "Черновик сохраняется автоматически";
  if (state.kind === "pending" || state.kind === "saving") content = "Сохраняем черновик…";
  if (state.kind === "saved") content = `Черновик сохранён в ${new Date(state.at).toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" })}`;
  if (state.kind === "conflict") content = "Автосохранение остановлено";
  if (state.kind === "error")
    return (
      <span className="save-state save-state--error" role="status">
        Черновик не сохранён: {state.message}{" "}
        <button type="button" className="btn--link" onClick={onRetry}>
          Повторить
        </button>
      </span>
    );
  return (
    <span className="save-state" role="status">
      {content}
    </span>
  );
}
