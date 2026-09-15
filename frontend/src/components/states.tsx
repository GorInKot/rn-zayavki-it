import type { ReactNode } from "react";

import { ApiError } from "../api/client";
import { plural } from "../lib/format";

export function Loading({ label = "Загрузка…" }: { label?: string }) {
  return (
    <div className="loading" role="status">
      {label}
    </div>
  );
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const message = error instanceof ApiError ? error.message : "Не удалось загрузить данные.";
  return (
    <div className="alert alert--danger" role="alert">
      <div className="alert__body">
        <div className="alert__title">Не получилось загрузить данные</div>
        {message}
      </div>
      {onRetry && (
        <button type="button" className="btn btn--secondary btn--small" onClick={onRetry}>
          Повторить
        </button>
      )}
    </div>
  );
}

export function Empty({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      {children && <p>{children}</p>}
      {action}
    </div>
  );
}

export function Pagination({
  page,
  pageSize,
  total,
  onPage,
}: {
  page: number;
  pageSize: number;
  total: number;
  onPage: (page: number) => void;
}) {
  const pages = Math.max(1, Math.ceil(total / pageSize));
  if (total === 0) return null;
  const from = (page - 1) * pageSize + 1;
  const to = Math.min(total, page * pageSize);
  return (
    <nav className="pagination" aria-label="Страницы списка">
      <span className="muted">
        Показаны {from}–{to} из {plural(total, ["заявки", "заявок", "заявок"])}
      </span>
      {pages > 1 && (
        <div className="row">
          <button type="button" className="btn btn--secondary btn--small" disabled={page <= 1} onClick={() => onPage(page - 1)}>
            ← Назад
          </button>
          <span>
            Страница {page} из {pages}
          </span>
          <button type="button" className="btn btn--secondary btn--small" disabled={page >= pages} onClick={() => onPage(page + 1)}>
            Вперёд →
          </button>
        </div>
      )}
    </nav>
  );
}
