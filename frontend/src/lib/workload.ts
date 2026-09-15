import type { DurationUnit, Frequency } from "../api/types";

const UNIT_HOURS: Record<DurationUnit, number> = { minutes: 1 / 60, hours: 1, days: 8 };
const PERIODS_PER_MONTH: Record<Exclude<Frequency, "irregular">, number> = { day: 21, week: 52 / 12, month: 1, quarter: 1 / 3, year: 1 / 12 };

/** Та же формула, что на сервере: человеко-часы в месяц. */
export function hoursPerMonth(frequency: string, duration: string, unit: string, times: string, employees: string): number | null {
  if (!frequency || frequency === "irregular") return null;
  const values = [duration, times, employees].map((value) => Number(String(value).replace(",", ".")));
  if (values.some((value) => !Number.isFinite(value) || value <= 0) || !(unit in UNIT_HOURS)) return null;
  const [d, t, e] = values;
  return d * UNIT_HOURS[unit as DurationUnit] * t * e * PERIODS_PER_MONTH[frequency as Exclude<Frequency, "irregular">];
}
