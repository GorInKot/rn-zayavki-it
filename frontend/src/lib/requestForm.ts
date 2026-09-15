import type { Dictionaries, Me, RequestDetail } from "../api/types";

export interface DocumentRef {
  id: string;
  usage: string;
  future_use: string;
}

export interface RequestForm {
  applicant: { phone: string; department: string; region_id: string };
  type: string;
  existing_system_name: string;
  topic_id: string;
  topic_other: string;
  process: string;
  problem: string;
  desired_result: string;
  method_suggestion: string;
  beneficiaries: string;
  result_recipient: string;
  workload: { frequency: string; duration: string; duration_unit: string; times_per_period: string; employees_count: string; note: string };
  documents: DocumentRef[];
  consent: boolean;
  confirm: boolean;
}

export type Errors = Record<string, string>;
export type Mode = "new" | "clarification";

export const LIMITS = {
  text: 20000,
  short: 4000,
  department: 256,
  existing_system_name: 500,
  topic_other: 200,
} as const;

export const STEP_TITLES = ["Заявитель", "Тип и тематика", "Описание процесса", "Трудоёмкость и документы", "Проверка и отправка"];

export const FIELD_NAMES: Record<string, string> = {
  "applicant.phone": "Телефон",
  "applicant.department": "Подразделение",
  "applicant.region_id": "Регион",
  consent: "Согласие на обработку данных",
  type: "Тип заявки",
  existing_system_name: "Название существующей системы",
  topic_id: "Тематика",
  topic_other: "Тематика",
  process: "Текущий процесс",
  problem: "Что требует автоматизации",
  desired_result: "Желаемый результат",
  method_suggestion: "Предложения по способу автоматизации",
  beneficiaries: "Кто получит выгоду",
  result_recipient: "Получатель результата",
  "workload.frequency": "Периодичность",
  "workload.duration": "Длительность операции",
  "workload.duration_unit": "Единица измерения",
  "workload.times_per_period": "Количество повторений",
  "workload.employees_count": "Количество сотрудников",
  "workload.note": "Описание трудоёмкости",
  documents: "Документы",
  confirm: "Подтверждение",
};

export function fieldId(path: string): string {
  if (path.startsWith("documents")) return "documents";
  return path.replace(/\./g, "-");
}

export function stepOfPath(path: string): number {
  if (path.startsWith("applicant.") || path === "consent") return 0;
  if (["type", "existing_system_name", "topic_id", "topic_other"].includes(path)) return 1;
  if (path.startsWith("workload.") || path.startsWith("documents")) return 3;
  if (path === "confirm") return 4;
  return 2;
}

export function emptyForm(me: Me): RequestForm {
  const defaults = me.applicant_defaults;
  return {
    applicant: { phone: defaults.phone ?? "", department: defaults.department ?? "", region_id: defaults.region_id ? String(defaults.region_id) : "" },
    type: "",
    existing_system_name: "",
    topic_id: "",
    topic_other: "",
    process: "",
    problem: "",
    desired_result: "",
    method_suggestion: "",
    beneficiaries: "",
    result_recipient: "",
    workload: { frequency: "", duration: "", duration_unit: "hours", times_per_period: "", employees_count: "1", note: "" },
    documents: [],
    consent: false,
    confirm: false,
  };
}

export function formFromRequest(request: RequestDetail): RequestForm {
  return {
    applicant: { phone: request.applicant_phone, department: request.applicant_department, region_id: String(request.region_id) },
    type: request.type,
    existing_system_name: request.existing_system_name ?? "",
    topic_id: String(request.topic_id),
    topic_other: request.topic_other ?? "",
    process: request.process,
    problem: request.problem,
    desired_result: request.desired_result,
    method_suggestion: request.method_suggestion ?? "",
    beneficiaries: request.beneficiaries,
    result_recipient: request.result_recipient,
    workload: {
      frequency: request.frequency,
      duration: request.duration ? String(Number(request.duration)) : "",
      duration_unit: request.duration_unit ?? "hours",
      times_per_period: request.times_per_period ? String(request.times_per_period) : "",
      employees_count: request.employees_count ? String(request.employees_count) : "",
      note: request.workload_note ?? "",
    },
    documents: request.documents.map((document) => ({ id: document.id, usage: document.usage ?? "", future_use: document.future_use ?? "" })),
    consent: true,
    confirm: false,
  };
}

/** Черновик мог сохраниться старой версией формы — берём только поля знакомого типа. */
export function restoreForm(data: unknown, fallback: RequestForm): RequestForm {
  const merge = (base: Record<string, unknown>, incoming: unknown): Record<string, unknown> => {
    if (!incoming || typeof incoming !== "object" || Array.isArray(incoming)) return base;
    const source = incoming as Record<string, unknown>;
    const result: Record<string, unknown> = { ...base };
    for (const [key, value] of Object.entries(base)) {
      const next = source[key];
      if (next === undefined) continue;
      if (value && typeof value === "object" && !Array.isArray(value)) result[key] = merge(value as Record<string, unknown>, next);
      else if (Array.isArray(value) && Array.isArray(next))
        result[key] = next
          .filter((item) => item && typeof item === "object" && typeof (item as DocumentRef).id === "string")
          .map((item) => ({ id: (item as DocumentRef).id, usage: String((item as DocumentRef).usage ?? ""), future_use: String((item as DocumentRef).future_use ?? "") }));
      else if (typeof value === typeof next) result[key] = next;
    }
    return result;
  };
  return merge(fallback as unknown as Record<string, unknown>, data) as unknown as RequestForm;
}

export function setPath<T>(object: T, path: string, value: unknown): T {
  const [head, ...rest] = path.split(".");
  const source = object as Record<string, unknown>;
  return { ...source, [head]: rest.length ? setPath(source[head], rest.join("."), value) : value } as T;
}

const blank = (value: string) => value.trim() === "";
const toNumber = (value: string) => Number(value.trim().replace(",", "."));

export function toPayload(form: RequestForm, dictionaries: Dictionaries) {
  const topic = dictionaries.topics.find((item) => String(item.id) === form.topic_id);
  const irregular = form.workload.frequency === "irregular";
  const optional = (value: string) => (blank(value) ? null : value.trim());
  return {
    applicant: { phone: form.applicant.phone.trim(), department: form.applicant.department.trim(), region_id: Number(form.applicant.region_id) },
    type: form.type,
    existing_system_name: form.type === "upgrade" ? optional(form.existing_system_name) : null,
    topic_id: Number(form.topic_id),
    topic_other: topic?.requires_detail ? optional(form.topic_other) : null,
    process: form.process.trim(),
    problem: form.problem.trim(),
    desired_result: form.desired_result.trim(),
    method_suggestion: optional(form.method_suggestion),
    beneficiaries: form.beneficiaries.trim(),
    result_recipient: form.result_recipient.trim(),
    workload: {
      frequency: form.workload.frequency,
      duration: irregular || blank(form.workload.duration) ? null : form.workload.duration.trim().replace(",", "."),
      duration_unit: irregular ? null : form.workload.duration_unit || null,
      times_per_period: irregular || blank(form.workload.times_per_period) ? null : toNumber(form.workload.times_per_period),
      employees_count: irregular || blank(form.workload.employees_count) ? null : toNumber(form.workload.employees_count),
      note: optional(form.workload.note),
    },
    documents: form.documents.map((document) => ({ id: document.id, usage: optional(document.usage), future_use: optional(document.future_use) })),
    consent: form.consent,
  };
}

export const PHONE_HINT = "Укажите номер в формате +7 912 345-67-89, добавочный — через «доб.», или внутренний номер из 3–6 цифр";

export function phoneError(value: string): string | null {
  let raw = value.trim();
  if (!raw) return "Укажите телефон для связи";
  let extension: string | null = null;
  const match = /(?:доб\.?|добавочный|ext\.?|#)\s*(\d{1,6})\s*$/i.exec(raw);
  if (match) {
    extension = match[1];
    raw = raw.slice(0, match.index).trim().replace(/[,;]+$/, "");
  }
  if (!raw || !/^[\d\s()+\-.]+$/.test(raw)) return PHONE_HINT;
  let digits = raw.replace(/\D/g, "");
  if (extension === null && digits.length >= 3 && digits.length <= 6 && !raw.includes("+")) return null;
  if (digits.length === 11 && "78".includes(digits[0])) digits = digits.slice(1);
  if (digits.length !== 10 || digits[0] === "0" || new Set(digits).size === 1) return PHONE_HINT;
  return null;
}

function numberError(value: string, { integer, max, empty }: { integer: boolean; max: number; empty: string }): string | null {
  if (blank(value)) return empty;
  const normalized = value.trim().replace(",", ".");
  if (!/^\d+(\.\d+)?$/.test(normalized)) return integer ? "Введите целое число" : "Введите число, например 1,5";
  const number = Number(normalized);
  if (integer && !Number.isInteger(number)) return "Введите целое число";
  if (!integer && (normalized.split(".")[1]?.length ?? 0) > 2) return "Не больше двух знаков после запятой";
  if (number <= 0) return "Значение должно быть больше нуля";
  if (number > max) return `Значение должно быть не больше ${max.toLocaleString("ru-RU")}`;
  return null;
}

function lengthError(value: string, max: number): string | null {
  return value.length > max ? `Не более ${max.toLocaleString("ru-RU")} символов` : null;
}

export function validateStep(step: number, form: RequestForm, dictionaries: Dictionaries, mode: Mode): Errors {
  const errors: Errors = {};
  const put = (path: string, message: string | null) => {
    if (message) errors[path] = message;
  };
  const required = (path: string, value: string, message: string, max: number) => put(path, blank(value) ? message : lengthError(value, max));

  if (step === 0) {
    put("applicant.phone", phoneError(form.applicant.phone));
    required("applicant.department", form.applicant.department, "Укажите подразделение", LIMITS.department);
    put("applicant.region_id", form.applicant.region_id ? null : "Выберите регион");
    if (mode === "new") put("consent", form.consent ? null : "Подтвердите согласие на обработку персональных данных");
  }
  if (step === 1) {
    put("type", form.type ? null : "Выберите тип заявки");
    if (form.type === "upgrade") required("existing_system_name", form.existing_system_name, "Укажите название существующей системы", LIMITS.existing_system_name);
    const topic = dictionaries.topics.find((item) => String(item.id) === form.topic_id);
    put("topic_id", topic ? null : "Выберите тематику");
    if (topic?.requires_detail) required("topic_other", form.topic_other, "Укажите тематику", LIMITS.topic_other);
  }
  if (step === 2) {
    required("process", form.process, "Опишите, как процесс выполняется сейчас", LIMITS.text);
    required("problem", form.problem, "Опишите, что именно нужно автоматизировать", LIMITS.text);
    required("desired_result", form.desired_result, "Опишите, каким должен стать процесс", LIMITS.text);
    put("method_suggestion", lengthError(form.method_suggestion, LIMITS.text));
    required("beneficiaries", form.beneficiaries, "Укажите, кто получит выгоду", LIMITS.short);
    required("result_recipient", form.result_recipient, "Укажите, кто получает результат процесса", LIMITS.short);
  }
  if (step === 3) {
    const workload = form.workload;
    put("workload.frequency", workload.frequency ? null : "Выберите, как часто выполняется операция");
    if (workload.frequency === "irregular") {
      put("workload.note", blank(workload.note) ? "Опишите, как часто возникает процесс и сколько времени он занимает" : lengthError(workload.note, LIMITS.short));
    } else if (workload.frequency) {
      put("workload.duration", numberError(workload.duration, { integer: false, max: 10000, empty: "Укажите, сколько времени занимает одна операция" }));
      put("workload.duration_unit", workload.duration_unit ? null : "Выберите единицу измерения");
      put("workload.times_per_period", numberError(workload.times_per_period, { integer: true, max: 100000, empty: "Укажите, сколько раз операция выполняется за период" }));
      put("workload.employees_count", numberError(workload.employees_count, { integer: true, max: 100000, empty: "Укажите, сколько сотрудников её выполняют" }));
      put("workload.note", lengthError(workload.note, LIMITS.short));
    }
    if (form.documents.length > dictionaries.max_files_per_request) put("documents", `Можно приложить не более ${dictionaries.max_files_per_request} файлов`);
  }
  if (step === 4) {
    put("confirm", form.confirm ? null : "Подтвердите, что данные указаны верно");
  }
  return errors;
}

export function validateAll(form: RequestForm, dictionaries: Dictionaries, mode: Mode): { errors: Errors; firstStep: number | null } {
  for (let step = 0; step < STEP_TITLES.length; step += 1) {
    const errors = validateStep(step, form, dictionaries, mode);
    if (Object.keys(errors).length) return { errors, firstStep: step };
  }
  return { errors: {}, firstStep: null };
}
