import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import { Link, useSearchParams } from "react-router";

import { api, ApiError, download } from "../../api/client";
import { useDictionaries } from "../../api/hooks";
import type { RequestPage } from "../../api/types";
import { Select, TextInput } from "../../components/fields";
import { Empty, ErrorState, Loading, Pagination } from "../../components/states";
import { SlaChip, StatusBadge } from "../../components/status";
import { useToast } from "../../components/Toasts";
import { formatDate, formatDay, plural } from "../../lib/format";
import { REQUESTS, STATUS_LABELS } from "../../lib/labels";
import { useTitle } from "../../lib/useTitle";

const COLUMNS: { key: string; label: string; sortable: boolean }[] = [
  { key: "number", label: "Номер", sortable: true },
  { key: "submitted_at", label: "Подана", sortable: true },
  { key: "applicant", label: "Заявитель", sortable: true },
  { key: "region", label: "Регион", sortable: true },
  { key: "type", label: "Тип", sortable: true },
  { key: "topic", label: "Тематика", sortable: true },
  { key: "status", label: "Статус", sortable: true },
  { key: "review_due_date", label: "Рассмотреть до", sortable: true },
  { key: "deadline", label: "Срок реализации", sortable: true },
  { key: "responsible", label: "Ответственный", sortable: true },
];

const ATTENTION_OPTIONS = [
  { value: "unviewed", label: "Не просмотрены" },
  { value: "due_soon", label: "Срок рассмотрения истекает" },
  { value: "overdue", label: "Срок рассмотрения просрочен" },
];

const FILTER_KEYS = ["q", "status", "topic_id", "region_id", "type", "attention"];

export function RegistryPage() {
  useTitle("Реестр заявок");
  const [params, setParams] = useSearchParams();
  const dictionaries = useDictionaries();
  const toast = useToast();
  const [exporting, setExporting] = useState(false);

  const q = params.get("q") ?? "";
  const statuses = params.getAll("status");
  const sort = params.get("sort") ?? "submitted_at";
  const direction = params.get("direction") === "asc" ? "asc" : "desc";
  const page = Math.max(1, Number(params.get("page")) || 1);
  const pageSize = [20, 50, 100].includes(Number(params.get("page_size"))) ? Number(params.get("page_size")) : 20;
  const [search, setSearch] = useState(q);

  const query = {
    scope: "all",
    q,
    status: statuses,
    topic_id: params.get("topic_id"),
    region_id: params.get("region_id"),
    type: params.get("type"),
    attention: params.get("attention"),
    sort,
    direction,
  };

  const update = (patch: Record<string, string | null>, keepPage = false) => {
    const next = new URLSearchParams(params);
    for (const [key, value] of Object.entries(patch)) {
      next.delete(key);
      if (value) next.set(key, value);
    }
    if (!keepPage) next.delete("page");
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
    queryKey: ["requests", "registry", params.toString()],
    queryFn: () => api<RequestPage>("/requests", { query: { ...query, page, page_size: pageSize } }),
    placeholderData: keepPreviousData,
  });

  const filtered = FILTER_KEYS.some((key) => params.has(key));

  function toggleSort(key: string) {
    if (sort === key) update({ sort: key, direction: direction === "asc" ? "desc" : "asc" });
    else update({ sort: key, direction: ["number", "applicant", "region", "topic", "responsible", "review_due_date", "deadline"].includes(key) ? "asc" : "desc" });
  }

  async function exportExcel() {
    setExporting(true);
    try {
      await download("/requests/export.xlsx", "Заявки на автоматизацию.xlsx", query);
    } catch (error) {
      toast(error instanceof ApiError ? error.message : "Не удалось выгрузить реестр", "error");
    } finally {
      setExporting(false);
    }
  }

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Реестр заявок</h1>
          {list.data && <p className="page-head__sub">{filtered ? `Найдено: ${plural(list.data.total, REQUESTS)}` : `Всего ${plural(list.data.total, REQUESTS)}`}</p>}
        </div>
        <button type="button" className="btn btn--secondary" onClick={() => void exportExcel()} disabled={exporting || !list.data?.total}>
          {exporting ? "Готовим файл…" : "Выгрузить в Excel"}
        </button>
      </div>

      <div className="filters" role="search">
        <div className="field field--search">
          <TextInput id="registry-q" type="search" label="Поиск" placeholder="Номер, заявитель, подразделение, текст заявки" value={search} onChange={setSearch} />
        </div>
        <div className="field">
          <Select
            id="registry-status"
            label="Статус"
            placeholder="Все статусы"
            options={Object.entries(STATUS_LABELS).map(([value, label]) => ({ value, label }))}
            value={statuses.length === 1 ? statuses[0] : ""}
            onChange={(value) => update({ status: value })}
          />
        </div>
        <div className="field">
          <Select
            id="registry-topic"
            label="Тематика"
            placeholder="Все тематики"
            options={(dictionaries.data?.topics ?? []).map((item) => ({ value: String(item.id), label: item.name }))}
            value={params.get("topic_id") ?? ""}
            onChange={(value) => update({ topic_id: value })}
          />
        </div>
        <div className="field">
          <Select
            id="registry-region"
            label="Регион"
            placeholder="Все регионы"
            options={(dictionaries.data?.regions ?? []).map((item) => ({ value: String(item.id), label: item.name }))}
            value={params.get("region_id") ?? ""}
            onChange={(value) => update({ region_id: value })}
          />
        </div>
        <div className="field">
          <Select
            id="registry-type"
            label="Тип"
            placeholder="Любой тип"
            options={[
              { value: "new", label: "Новая автоматизация" },
              { value: "upgrade", label: "Доработка" },
            ]}
            value={params.get("type") ?? ""}
            onChange={(value) => update({ type: value })}
          />
        </div>
        <div className="field">
          <Select
            id="registry-attention"
            label="Требуют внимания"
            placeholder="Все заявки"
            options={ATTENTION_OPTIONS}
            value={params.get("attention") ?? ""}
            onChange={(value) => update({ attention: value })}
          />
        </div>
        {filtered && (
          <button
            type="button"
            className="btn btn--ghost"
            onClick={() => {
              setSearch("");
              const next = new URLSearchParams();
              if (params.get("sort")) next.set("sort", sort);
              if (params.get("direction")) next.set("direction", direction);
              setParams(next, { replace: true });
            }}
          >
            Сбросить фильтры
          </button>
        )}
      </div>
      {statuses.length > 1 && (
        <p className="small muted" style={{ marginBottom: 10 }}>
          Показаны статусы: {statuses.map((value) => STATUS_LABELS[value as keyof typeof STATUS_LABELS]).join(", ")}.
        </p>
      )}

      {list.isPending ? (
        <Loading />
      ) : list.isError ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.items.length === 0 ? (
        <Empty title={filtered ? "Ничего не найдено" : "Заявок пока нет"}>{filtered ? "Измените условия поиска или сбросьте фильтры." : "Здесь появятся заявки сотрудников."}</Empty>
      ) : (
        <>
          <div className="table-wrap" aria-busy={list.isFetching}>
            <table className="table">
              <caption className="visually-hidden">Реестр заявок, сортировка: {COLUMNS.find((c) => c.key === sort)?.label}, {direction === "asc" ? "по возрастанию" : "по убыванию"}</caption>
              <thead>
                <tr>
                  {COLUMNS.map((column) => {
                    const active = sort === column.key;
                    return (
                      <th key={column.key} scope="col" aria-sort={active ? (direction === "asc" ? "ascending" : "descending") : undefined}>
                        <button type="button" className="sort-button" onClick={() => toggleSort(column.key)}>
                          {column.label}
                          <span className="sort-button__icon" aria-hidden="true">
                            {active ? (direction === "asc" ? "▲" : "▼") : ""}
                          </span>
                        </button>
                      </th>
                    );
                  })}
                </tr>
              </thead>
              <tbody>
                {list.data.items.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <Link to={`/requests/${item.id}`} className="table__number">
                        {item.number}
                      </Link>
                      {item.is_unviewed && (
                        <div>
                          <span className="dot-new">Не просмотрена</span>
                        </div>
                      )}
                    </td>
                    <td className="nowrap">{formatDate(item.submitted_at)}</td>
                    <td>
                      {item.applicant_name}
                      <div className="small muted">{item.applicant_department}</div>
                    </td>
                    <td>{item.region_name}</td>
                    <td>{item.type === "upgrade" ? "Доработка" : "Новая"}</td>
                    <td>{item.topic_name}</td>
                    <td>
                      <StatusBadge status={item.status} />
                    </td>
                    <td>
                      {item.status === "review" && <div className="nowrap">{formatDay(item.review_due_date)}</div>}
                      <SlaChip sla={item.sla} />
                      {item.status !== "review" && item.status !== "clarification" && <span className="muted">—</span>}
                    </td>
                    <td className="nowrap">{formatDay(item.deadline)}</td>
                    <td>{item.responsible ?? <span className="muted">—</span>}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="pagination">
            <Pagination page={page} pageSize={pageSize} total={list.data.total} onPage={(next) => update({ page: String(next) }, true)} />
            <label className="row small">
              Строк на странице
              <select className="select" style={{ width: 90, minHeight: 34, padding: "4px 8px" }} value={pageSize} onChange={(event) => update({ page_size: event.target.value })}>
                {[20, 50, 100].map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </>
      )}
    </div>
  );
}
