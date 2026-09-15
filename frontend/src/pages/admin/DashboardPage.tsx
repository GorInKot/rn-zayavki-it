import { useQuery } from "@tanstack/react-query";
import { Link } from "react-router";

import { api } from "../../api/client";
import type { Dashboard } from "../../api/types";
import { ErrorState, Loading } from "../../components/states";
import { formatDay, formatHours, formatMonth, plural } from "../../lib/format";
import { BUSINESS_DAYS, REQUESTS } from "../../lib/labels";
import { useTitle } from "../../lib/useTitle";

function registryLink(params: Record<string, string | string[]>): string {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) (Array.isArray(value) ? value : [value]).forEach((item) => search.append(key, item));
  return `/admin/registry?${search.toString()}`;
}

function Bars({ items, empty }: { items: { label: string; count: number }[]; empty: string }) {
  if (!items.length) return <p className="muted">{empty}</p>;
  const max = Math.max(...items.map((item) => item.count));
  return (
    <ul className="bars">
      {items.map((item) => (
        <li key={item.label} className="bars__row">
          <span>{item.label}</span>
          <span className="bars__track" aria-hidden="true">
            <span className="bars__fill" style={{ width: `${(item.count / max) * 100}%`, display: "block" }} />
          </span>
          <span className="bars__value">{item.count}</span>
        </li>
      ))}
    </ul>
  );
}

export function DashboardPage() {
  useTitle("Дашборд");
  const query = useQuery({ queryKey: ["dashboard"], queryFn: () => api<Dashboard>("/admin/dashboard"), refetchInterval: 120_000 });

  if (query.isPending) return <Loading label="Считаем показатели…" />;
  if (query.isError)
    return (
      <div className="page">
        <ErrorState error={query.error} onRetry={() => query.refetch()} />
      </div>
    );

  const data = query.data;
  const maxMonth = Math.max(1, ...data.by_month.map((item) => item.count));
  const { workload, decision } = data;

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Дашборд</h1>
          <p className="page-head__sub">
            Всего {plural(data.total, REQUESTS)} · данные на {formatDay(data.today)}
          </p>
        </div>
        <Link to="/admin/registry" className="btn btn--secondary">
          Открыть реестр
        </Link>
      </div>

      <div className="stack">
        {data.missing_calendar_years.length > 0 && (
          <div className="alert alert--warning">
            <div className="alert__body">
              <div className="alert__title">Не заполнен производственный календарь на {data.missing_calendar_years.join(" и ")} год</div>
              Пока календаря нет, сроки рассмотрения учитывают только праздники, но не переносы выходных.
            </div>
            <Link to="/admin/calendar" className="btn btn--secondary btn--small">
              Заполнить
            </Link>
          </div>
        )}

        <section aria-labelledby="attention-title">
          <h2 id="attention-title" className="card__title" style={{ marginBottom: 10 }}>
            Требуют внимания
          </h2>
          <div className="tiles">
            <Link to={registryLink({ attention: "unviewed" })} className={`tile${data.attention.unviewed ? " tile--warn" : ""}`}>
              <div className="tile__value">{data.attention.unviewed}</div>
              <div className="tile__label">Не просмотрены</div>
            </Link>
            <Link to={registryLink({ attention: "due_soon" })} className={`tile${data.attention.due_soon ? " tile--warn" : ""}`}>
              <div className="tile__value">{data.attention.due_soon}</div>
              <div className="tile__label">Срок рассмотрения истекает</div>
            </Link>
            <Link to={registryLink({ attention: "overdue" })} className={`tile${data.attention.overdue ? " tile--alert" : ""}`}>
              <div className="tile__value">{data.attention.overdue}</div>
              <div className="tile__label">Рассмотрение просрочено</div>
            </Link>
          </div>
        </section>

        <section aria-labelledby="groups-title">
          <h2 id="groups-title" className="card__title">
            Заявки по статусам
          </h2>
          <p className="card__sub" style={{ marginBottom: 10 }}>
            Каждая заявка входит ровно в одну группу — сумма равна общему числу ({data.total}).
          </p>
          <div className="tiles">
            {data.groups.map((group) => (
              <Link key={group.key} to={registryLink({ status: group.statuses })} className="tile">
                <div className="tile__value">{group.count}</div>
                <div className="tile__label">{group.label}</div>
              </Link>
            ))}
          </div>
        </section>

        <div className="grid-2">
          <section className="card" aria-labelledby="months-title">
            <h2 id="months-title" className="card__title">
              Поступление заявок
            </h2>
            <p className="card__sub">Последние 12 месяцев</p>
            <ol className="months" aria-label="Количество поданных заявок по месяцам">
              {data.by_month.map((item) => (
                <li key={item.month} className="months__col">
                  <span className="months__count">{item.count}</span>
                  <span className="months__bar" style={{ height: `${(item.count / maxMonth) * 100}%` }} aria-hidden="true" />
                  <span>{formatMonth(item.month)}</span>
                </li>
              ))}
            </ol>
          </section>

          <section className="card" aria-labelledby="speed-title">
            <h2 id="speed-title" className="card__title" style={{ marginBottom: 12 }}>
              Скорость рассмотрения
            </h2>
            {decision.count === 0 ? (
              <p className="muted">Решений по заявкам пока не было.</p>
            ) : (
              <dl className="facts">
                <dt>Принято решений</dt>
                <dd>{decision.count}</dd>
                <dt>В среднем до решения</dt>
                <dd>{plural(decision.avg_business_days ?? 0, BUSINESS_DAYS)}</dd>
                <dt>Рассмотрено в срок</dt>
                <dd>
                  {decision.on_time_share}% <span className="muted small">(не дольше {plural(data.review_business_days, BUSINESS_DAYS)})</span>
                </dd>
              </dl>
            )}
            <h3 className="card__title" style={{ margin: "20px 0 8px", fontSize: 15 }}>
              Трудоёмкость процессов в работе
            </h3>
            {workload.total_hours_month === null ? (
              <p className="muted">В активных заявках нет оценки трудоёмкости.</p>
            ) : (
              <p>
                <strong style={{ fontSize: 22 }}>{formatHours(workload.total_hours_month)}</strong> человеко-часов в месяц
                <br />
                <span className="small muted">
                  Оценка есть в {workload.with_estimate} из {plural(workload.active_requests, ["активной заявки", "активных заявок", "активных заявок"])} — остальные процессы
                  нерегулярные.
                </span>
              </p>
            )}
          </section>
        </div>

        <div className="grid-2">
          <section className="card" aria-labelledby="topics-title">
            <h2 id="topics-title" className="card__title" style={{ marginBottom: 12 }}>
              По тематикам
            </h2>
            <Bars items={data.by_topic} empty="Заявок пока нет." />
          </section>
          <section className="card" aria-labelledby="regions-title">
            <h2 id="regions-title" className="card__title" style={{ marginBottom: 12 }}>
              По регионам
            </h2>
            <Bars items={data.by_region} empty="Заявок пока нет." />
          </section>
        </div>
      </div>
    </div>
  );
}
