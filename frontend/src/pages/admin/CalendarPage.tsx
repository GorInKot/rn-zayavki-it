import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { useSearchParams } from "react-router";

import { api, ApiError } from "../../api/client";
import type { CalendarDay } from "../../api/types";
import { Dialog } from "../../components/Dialog";
import { ChoiceGroup, TextInput } from "../../components/fields";
import { ErrorState, Loading } from "../../components/states";
import { useToast } from "../../components/Toasts";
import { formatDay } from "../../lib/format";
import { useTitle } from "../../lib/useTitle";

const WEEKDAYS = ["Пн", "Вт", "Ср", "Чт", "Пт", "Сб", "Вс"];
const monthName = new Intl.DateTimeFormat("ru-RU", { month: "long" });
const fullDate = new Intl.DateTimeFormat("ru-RU", { day: "numeric", month: "long", year: "numeric", weekday: "long" });

function iso(year: number, month: number, day: number) {
  return `${year}-${String(month + 1).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

export function CalendarPage() {
  useTitle("Производственный календарь");
  const [params, setParams] = useSearchParams();
  const currentYear = new Date().getFullYear();
  const year = Number(params.get("year")) || currentYear;
  const [selected, setSelected] = useState<string | null>(null);

  const query = useQuery({ queryKey: ["calendar", year], queryFn: () => api<CalendarDay[]>("/admin/calendar", { query: { year } }) });
  const overrides = new Map((query.data ?? []).map((row) => [row.day, row]));

  return (
    <div className="page">
      <div className="page-head">
        <div>
          <h1>Производственный календарь</h1>
          <p className="page-head__sub">По нему считаются сроки рассмотрения заявок</p>
        </div>
        <div className="row" role="group" aria-label="Выбор года">
          <button type="button" className="btn btn--secondary btn--small" onClick={() => setParams({ year: String(year - 1) })}>
            ← {year - 1}
          </button>
          <strong style={{ fontSize: 18, minWidth: 56, textAlign: "center" }} aria-live="polite">
            {year}
          </strong>
          <button type="button" className="btn btn--secondary btn--small" onClick={() => setParams({ year: String(year + 1) })}>
            {year + 1} →
          </button>
        </div>
      </div>

      <div className="stack">
        {query.data && query.data.length === 0 ? (
          <div className="alert alert--warning">
            <div className="alert__body">
              <div className="alert__title">Календарь на {year} год не заполнен</div>
              Пока записей нет, нерабочими считаются выходные и праздники из статьи 112 ТК РФ, но не переносы. Отметьте праздники и переносы по постановлению
              Правительства — оно выходит обычно осенью предыдущего года.
            </div>
          </div>
        ) : (
          <div className="alert alert--info">
            <div className="alert__body">
              Отмечайте только отличия от обычной пятидневки: нерабочие будни (праздники и переносы) и рабочие субботы или воскресенья. Нажмите на день, чтобы изменить
              его.
            </div>
          </div>
        )}

        <div className="legend" aria-hidden="true">
          <span>
            <i style={{ background: "var(--danger-soft)", border: "1px solid #eeb8b1" }} /> нерабочий будний день
          </span>
          <span>
            <i style={{ background: "var(--info-soft)", border: "1px solid #bcd0f0" }} /> рабочий выходной
          </span>
          <span>
            <i style={{ border: "1px solid var(--line)" }} /> <span style={{ color: "var(--danger)", fontWeight: 600 }}>12</span> обычный выходной
          </span>
        </div>

        {query.isPending ? (
          <Loading />
        ) : query.isError ? (
          <ErrorState error={query.error} onRetry={() => query.refetch()} />
        ) : (
          <div className="year">
            {Array.from({ length: 12 }, (_, month) => {
              const first = new Date(year, month, 1);
              const days = new Date(year, month + 1, 0).getDate();
              const offset = (first.getDay() + 6) % 7;
              return (
                <section key={month} className="month" aria-label={`${monthName.format(first)} ${year}`}>
                  <div className="month__name">{monthName.format(first)}</div>
                  <div className="month__grid">
                    {WEEKDAYS.map((weekday) => (
                      <span key={weekday} className="month__dow" aria-hidden="true">
                        {weekday}
                      </span>
                    ))}
                    {Array.from({ length: offset }, (_, index) => (
                      <span key={`gap-${index}`} />
                    ))}
                    {Array.from({ length: days }, (_, index) => {
                      const day = index + 1;
                      const key = iso(year, month, day);
                      const weekend = new Date(year, month, day).getDay() % 6 === 0;
                      const override = overrides.get(key);
                      let className = "day";
                      let state = weekend ? "выходной" : "рабочий день";
                      if (override && !override.is_working) {
                        className += " day--holiday";
                        state = "нерабочий день";
                      } else if (override?.is_working) {
                        className += " day--working-weekend";
                        state = "рабочий выходной";
                      } else if (weekend) className += " day--off";
                      return (
                        <button
                          key={key}
                          type="button"
                          className={className}
                          onClick={() => setSelected(key)}
                          aria-label={`${fullDate.format(new Date(year, month, day))}: ${state}${override?.note ? `, ${override.note}` : ""}`}
                          title={override?.note ?? undefined}
                        >
                          {day}
                        </button>
                      );
                    })}
                  </div>
                </section>
              );
            })}
          </div>
        )}

        {query.data && query.data.length > 0 && (
          <section className="card" aria-labelledby="overrides-title">
            <h2 id="overrides-title" className="card__title" style={{ marginBottom: 12 }}>
              Отличия от пятидневки в {year} году
            </h2>
            <dl className="facts">
              {query.data.map((row) => (
                <div key={row.day} style={{ display: "contents" }}>
                  <dt>{formatDay(row.day)}</dt>
                  <dd>
                    {row.is_working ? "Рабочий день" : "Нерабочий день"}
                    {row.note ? ` — ${row.note}` : ""}
                  </dd>
                </div>
              ))}
            </dl>
          </section>
        )}
      </div>

      {selected && <DayDialog day={selected} current={overrides.get(selected) ?? null} year={year} onClose={() => setSelected(null)} />}
    </div>
  );
}

function DayDialog({ day, current, year, onClose }: { day: string; current: CalendarDay | null; year: number; onClose: () => void }) {
  const queryClient = useQueryClient();
  const toast = useToast();
  const date = new Date(`${day}T12:00:00`);
  const weekend = date.getDay() % 6 === 0;
  const [kind, setKind] = useState(current ? (current.is_working ? "working" : "off") : "default");
  const [note, setNote] = useState(current?.note ?? "");

  const mutation = useMutation({
    mutationFn: () =>
      kind === "default"
        ? api(`/admin/calendar/${day}`, { method: "DELETE" })
        : api(`/admin/calendar/${day}`, { method: "PUT", body: { is_working: kind === "working", note: note.trim() || null } }),
    onSuccess: () => {
      void queryClient.invalidateQueries({ queryKey: ["calendar", year] });
      void queryClient.invalidateQueries({ queryKey: ["dashboard"] });
      toast(`${formatDay(day)} сохранено`);
      onClose();
    },
  });

  return (
    <Dialog
      open
      title={fullDate.format(date)}
      onClose={onClose}
      onSubmit={() => mutation.mutate()}
      footer={
        <>
          <button type="button" className="btn btn--secondary" onClick={onClose}>
            Отмена
          </button>
          <button type="submit" className="btn btn--primary" disabled={mutation.isPending}>
            Сохранить
          </button>
        </>
      }
    >
      <div className="stack">
        <ChoiceGroup
          id="day-kind"
          legend="Какой это день"
          value={kind}
          onChange={setKind}
          minWidth={400}
          options={[
            { value: "default", label: weekend ? "Обычный выходной" : "Обычный рабочий день", description: "Без отметки в календаре" },
            { value: "off", label: "Нерабочий день", description: "Праздник или перенесённый выходной" },
            { value: "working", label: "Рабочий день", description: "Перенос рабочего дня на выходной" },
          ]}
        />
        {kind !== "default" && <TextInput id="day-note" label="Пояснение" optional maxLength={256} placeholder="Например: перенос с 3 января" value={note} onChange={setNote} />}
        {mutation.error && (
          <div className="alert alert--danger" role="alert">
            {mutation.error instanceof ApiError ? mutation.error.message : "Не удалось сохранить"}
          </div>
        )}
      </div>
    </Dialog>
  );
}
