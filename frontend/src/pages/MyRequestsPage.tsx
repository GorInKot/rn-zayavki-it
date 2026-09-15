import { keepPreviousData, useQuery, useQueryClient } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { api, ApiError } from "../api/client";
import { useDictionaries } from "../api/hooks";
import type { Draft, RequestListItem, RequestPage } from "../api/types";
import { Dialog } from "../components/Dialog";
import { Select, TextInput } from "../components/fields";
import { Empty, ErrorState, Loading, Pagination } from "../components/states";
import { SlaChip, StatusBadge } from "../components/status";
import { useToast } from "../components/Toasts";
import { formatDate, formatDateTime, formatDay, plural } from "../lib/format";
import { REQUESTS, STATUS_LABELS } from "../lib/labels";
import { useTitle } from "../lib/useTitle";

const PAGE_SIZE = 12;

export function MyRequestsPage() {
  useTitle("Мои заявки");
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "";
  const status = params.get("status") ?? "";
  const topic = params.get("topic_id") ?? "";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const [search, setSearch] = useState(q);
  const dictionaries = useDictionaries();
  const queryClient = useQueryClient();
  const toast = useToast();
  const [discardOpen, setDiscardOpen] = useState(false);

  const update = (patch: Record<string, string>) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      if (value) next.set(key, value);
      else next.delete(key);
    }
    if (!("page" in patch)) next.delete("page");
    setParams(next, { replace: true });
  };

  useEffect(() => {
    const timer = window.setTimeout(() => {
      if (search.trim() !== q) update({ q: search.trim() });
    }, 350);
    return () => window.clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [search]);

  const list = useQuery({
    queryKey: ["requests", "mine", q, status, topic, page],
    queryFn: () => api<RequestPage>("/requests", { query: { scope: "mine", q, status, topic_id: topic, page, page_size: PAGE_SIZE } }),
    placeholderData: keepPreviousData,
  });

  const draft = useQuery({
    queryKey: ["draft-summary"],
    queryFn: async () => {
      try {
        const data = await api<Draft>("/drafts/new");
        return data.data && Object.keys(data.data as object).length ? data : null;
      } catch (error) {
        if (error instanceof ApiError && error.status === 404) return null;
        throw error;
      }
    },
  });

  const filtered = Boolean(q || status || topic);
  const total = list.data?.total ?? 0;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Мои заявки</h1>
          {list.data && !filtered && <p className="page-head__sub">{total ? plural(total, REQUESTS) : "Заявок пока нет"}</p>}
        </div>
        <Link to="/requests/new" className="btn btn--primary">
          {draft.data ? "Продолжить черновик" : "Новая заявка"}
        </Link>
      </div>

      {draft.data && (
        <div className="alert alert--info" style={{ marginBottom: 16 }}>
          <div className="alert__body">
            <div className="alert__title">Есть незавершённая заявка</div>
            Черновик сохранён {formatDateTime(draft.data.updated_at)}. Его можно продолжить с того места, где вы остановились.
          </div>
          <div className="row">
            <Link to="/requests/new" className="btn btn--secondary btn--small">
              Продолжить
            </Link>
            <button type="button" className="btn btn--ghost btn--small" onClick={() => setDiscardOpen(true)}>
              Удалить
            </button>
          </div>
        </div>
      )}

      <div className="filters" role="search">
        <div className="field field--search">
          <TextInput id="filter-q" type="search" label="Поиск" placeholder="Номер или слова из текста заявки" value={search} onChange={setSearch} />
        </div>
        <div className="field">
          <Select
            id="filter-status"
            label="Статус"
            placeholder="Все статусы"
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            value={status}
            onChange={(value) => update({ status: value })}
          />
        </div>
        <div className="field">
          <Select
            id="filter-topic"
            label="Тематика"
            placeholder="Все тематики"
            options={(dictionaries.data?.topics ?? []).map((item) => ({ value: String(item.id), label: item.name }))}
            value={topic}
            onChange={(value) => update({ topic_id: value })}
          />
        </div>
        {filtered && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setSearch("");
              setParams(new URLSearchParams(), { replace: true });
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        filtered ? (
          <Empty title="Ничего не найдено">Попробуйте изменить запрос или сбросить фильтры.</Empty>
        ) : (
          <Empty title="У вас пока нет заявок" action={<Link to="/requests/new" className="btn btn--primary">Подать первую заявку</Link>}>
            Опишите процесс, который хотелось бы автоматизировать, — это займёт около десяти минут.
          </Empty>
        )
      ) : (
        <>
          {filtered && (
            <p className="muted" role="status" style={{ marginBottom: 10 }}>
              Найдено: {plural(total, REQUESTS)}
            </p>
          )}
          <ul className="request-cards" aria-busy={list.isFetching}>
            {list.data.items.map((item) => (
              <li key={item.id}>
                <RequestCard item={item} />
              </li>
            ))}
          </ul>
          <Pagination page={page} pageSize={PAGE_SIZE} total={total} onPage={(next) => update({ page: String(next) })} />
        </>
      )}

      <Dialog
        open={discardOpen}
        title="Удалить черновик?"
        description="Введённые данные и загруженные файлы будут удалены без возможности восстановления."
        onClose={() => setDiscardOpen(false)}
        onSubmit={async () => {
          try {
            await api("/drafts/new", { method: "DELETE" });
            toast("Черновик удалён");
            void queryClient.invalidateQueries({ queryKey: ["draft-summary"] });
          } catch (error) {
            toast(error instanceof ApiError ? error.message : "Не удалось удалить черновик", "error");
          }
          setDiscardOpen(false);
        }}
        footer={
          <>
            <button type="button" className="btn btn--secondary" onClick={() => setDiscardOpen(false)}>
              Оставить
            </button>
            <button type="submit" className="btn btn--danger">
              Удалить черновик
            </button>
          </>
        }
      />
    </div>
  );
}

function RequestCard({ item }: { item: RequestListItem }) {
  let note: React.ReactNode = null;
  if (item.status === "clarification") note = <span className="chip chip--due_soon">Нужен ваш ответ</span>;
  else if (item.status === "review") note = <span>Рассмотрят до {formatDay(item.review_due_date)}</span>;
  else if (item.deadline && ["accepted", "development", "testing"].includes(item.status)) note = <span>Срок: {formatDay(item.deadline)}</span>;

  return (
    <Link to={`/requests/${item.id}`} className="request-card">
      <div className="request-card__top">
        <span className="mono small">{item.number}</span>
        <StatusBadge status={item.status} />
      </div>
      <div className="request-card__title">{item.title}</div>
      <div className="small muted">{item.topic_name}</div>
      <div className="request-card__meta">
        <span>Подана {formatDate(item.submitted_at)}</span>
        {note}
        {item.status === "review" && item.sla.state === "overdue" && <SlaChip sla={item.sla} />}
      </div>
    </Link>
  );
}
