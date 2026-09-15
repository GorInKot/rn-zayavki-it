import type { DurationUnit, Frequency, RequestStatus, RequestType } from "../api/types";

export const STATUS_LABELS: Record<RequestStatus, string> = {
  review: "На рассмотрении",
  clarification: "Требуется уточнение",
  accepted: "Принята в работу",
  development: "В разработке",
  testing: "Тестирование",
  done: "Готово",
  closed: "Закрыта",
  rejected: "Отклонена",
  withdrawn: "Отозвана заявителем",
};

export const TYPE_LABELS: Record<RequestType, string> = {
  new: "Новая автоматизация",
  upgrade: "Доработка существующей автоматизации",
};

export const FREQUENCY_LABELS: Record<Frequency, string> = {
  day: "в день",
  week: "в неделю",
  month: "в месяц",
  quarter: "в квартал",
  year: "в год",
  irregular: "нерегулярно",
};

export const FREQUENCY_OPTIONS: { value: Frequency; label: string }[] = [
  { value: "day", label: "Каждый день" },
  { value: "week", label: "Каждую неделю" },
  { value: "month", label: "Каждый месяц" },
  { value: "quarter", label: "Каждый квартал" },
  { value: "year", label: "Раз в год или реже" },
  { value: "irregular", label: "Нерегулярно, по мере необходимости" },
];

export const UNIT_OPTIONS: { value: DurationUnit; label: string }[] = [
  { value: "minutes", label: "минут" },
  { value: "hours", label: "часов" },
  { value: "days", label: "рабочих дней (по 8 ч)" },
];

export const UNIT_LABELS: Record<DurationUnit, string> = { minutes: "мин", hours: "ч", days: "раб. дн." };

export const BUSINESS_DAYS: [string, string, string] = ["рабочий день", "рабочих дня", "рабочих дней"];
export const REQUESTS: [string, string, string] = ["заявка", "заявки", "заявок"];
