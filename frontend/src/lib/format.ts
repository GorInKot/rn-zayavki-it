const dateFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric" });
const dateTimeFormatter = new Intl.DateTimeFormat("ru-RU", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
const monthFormatter = new Intl.DateTimeFormat("ru-RU", { month: "short" });
const numberFormatter = new Intl.NumberFormat("ru-RU", { maximumFractionDigits: 1 });

/** Дата без времени приходит как «2026-09-21» — разбираем её как локальную, а не как полночь UTC. */
export function parseDay(value: string): Date {
  const [year, month, day] = value.slice(0, 10).split("-").map(Number);
  return new Date(year, month - 1, day);
}

export function formatDay(value: string | null | undefined): string {
  return value ? dateFormatter.format(parseDay(value)) : "—";
}

export function formatDateTime(value: string | null | undefined): string {
  return value ? dateTimeFormatter.format(new Date(value)) : "—";
}

export function formatDate(value: string | null | undefined): string {
  return value ? dateFormatter.format(new Date(value)) : "—";
}

export function formatMonth(value: string): string {
  return monthFormatter.format(parseDay(value)).replace(".", "");
}

export function formatNumber(value: number): string {
  return numberFormatter.format(value);
}

export function todayIso(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

/** plural(3, ["заявка", "заявки", "заявок"]) → «3 заявки» */
export function plural(count: number, forms: [string, string, string], withNumber = true): string {
  const mod10 = Math.abs(count) % 10;
  const mod100 = Math.abs(count) % 100;
  const form = mod100 > 10 && mod100 < 20 ? forms[2] : mod10 === 1 ? forms[0] : mod10 >= 2 && mod10 <= 4 ? forms[1] : forms[2];
  return withNumber ? `${formatNumber(count)} ${form}` : form;
}

export function formatHours(hours: number | null): string {
  if (hours === null || !Number.isFinite(hours)) return "—";
  if (hours < 1) return `${Math.max(1, Math.round(hours * 60))} мин`;
  return `${numberFormatter.format(hours)} ч`;
}

export function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} Б`;
  if (bytes < 1024 * 1024) return `${numberFormatter.format(bytes / 1024)} КБ`;
  return `${numberFormatter.format(bytes / 1024 / 1024)} МБ`;
}
