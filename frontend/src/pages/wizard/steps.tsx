import type { Dictionaries, DocumentInfo, Me } from "../../api/types";
import { Checkbox, ChoiceGroup, Select, TextArea, TextInput } from "../../components/fields";
import { formatHours } from "../../lib/format";
import { FREQUENCY_LABELS, FREQUENCY_OPTIONS, TYPE_LABELS, UNIT_OPTIONS } from "../../lib/labels";
import { LIMITS, STEP_TITLES, type Errors, type Mode, type RequestForm } from "../../lib/requestForm";
import { hoursPerMonth } from "../../lib/workload";
import { DocumentsField } from "./DocumentsField";

export interface StepProps {
  form: RequestForm;
  errors: Errors;
  set: (path: string, value: unknown) => void;
  dictionaries: Dictionaries;
  me: Me;
  mode: Mode;
}

export function ApplicantStep({ form, errors, set, dictionaries, me, mode }: StepProps) {
  return (
    <section className="card" aria-labelledby="step-title">
      <h2 id="step-title" className="card__title">
        Данные заявителя
      </h2>
      <p className="card__sub" style={{ marginBottom: 18 }}>
        По этим данным с вами свяжутся, если по заявке появятся вопросы. ФИО и почта берутся из учётной записи портала.
      </p>
      <div className="field-grid">
        <TextInput id="applicant-name" label="ФИО" value={me.user.full_name} onChange={() => undefined} readOnly />
        <TextInput id="applicant-email" label="Электронная почта" value={me.user.email ?? "не указана в учётной записи"} onChange={() => undefined} readOnly />
      </div>
      <div className="field-grid">
        <TextInput
          id="applicant-phone"
          label="Телефон для связи"
          required
          type="tel"
          inputMode="tel"
          autoComplete="tel"
          placeholder="+7 912 345-67-89 доб. 123"
          hint="Мобильный или рабочий. Добавочный — через «доб.», можно указать и внутренний номер."
          value={form.applicant.phone}
          error={errors["applicant.phone"]}
          onChange={(value) => set("applicant.phone", value)}
        />
        <Select
          id="applicant-region_id"
          label="Регион"
          required
          placeholder="Выберите регион"
          options={dictionaries.regions.map((region) => ({ value: String(region.id), label: region.name }))}
          value={form.applicant.region_id}
          error={errors["applicant.region_id"]}
          onChange={(value) => set("applicant.region_id", value)}
        />
      </div>
      <TextInput
        id="applicant-department"
        label="Структурное подразделение"
        required
        autoComplete="organization"
        maxLength={LIMITS.department}
        placeholder="Например: отдел экономики и планирования"
        value={form.applicant.department}
        error={errors["applicant.department"]}
        onChange={(value) => set("applicant.department", value)}
      />
      {mode === "new" && (
        <div style={{ marginTop: 20 }}>
          <Checkbox
            id="consent"
            label="Даю согласие на обработку указанных персональных данных в целях рассмотрения заявки"
            checked={form.consent}
            error={errors.consent}
            onChange={(value) => set("consent", value)}
          />
        </div>
      )}
    </section>
  );
}

export function SubjectStep({ form, errors, set, dictionaries }: StepProps) {
  const topic = dictionaries.topics.find((item) => String(item.id) === form.topic_id);
  return (
    <section className="card" aria-labelledby="step-title">
      <h2 id="step-title" className="card__title" style={{ marginBottom: 18 }}>
        Тип и тематика заявки
      </h2>
      <ChoiceGroup
        id="type"
        legend="О чём заявка"
        required
        value={form.type}
        error={errors.type}
        onChange={(value) => set("type", value)}
        options={[
          { value: "new", label: TYPE_LABELS.new, description: "Процесс сейчас выполняется вручную или без единой системы" },
          { value: "upgrade", label: TYPE_LABELS.upgrade, description: "Система уже есть, но её нужно улучшить или расширить" },
        ]}
      />
      {form.type === "upgrade" && (
        <div style={{ marginTop: 18 }}>
          <TextInput
            id="existing_system_name"
            label="Название существующей системы"
            required
            maxLength={LIMITS.existing_system_name}
            placeholder="Например: модуль «HR-Portal»"
            value={form.existing_system_name}
            error={errors.existing_system_name}
            onChange={(value) => set("existing_system_name", value)}
          />
        </div>
      )}
      <div style={{ marginTop: 24 }}>
        <ChoiceGroup
          id="topic_id"
          legend="Тематика"
          hint="Область, к которой относится процесс"
          required
          minWidth={170}
          value={form.topic_id}
          error={errors.topic_id}
          onChange={(value) => set("topic_id", value)}
          options={dictionaries.topics.map((item) => ({ value: String(item.id), label: item.name }))}
        />
      </div>
      {topic?.requires_detail && (
        <div style={{ marginTop: 18 }}>
          <TextInput
            id="topic_other"
            label="Укажите тематику"
            required
            maxLength={LIMITS.topic_other}
            value={form.topic_other}
            error={errors.topic_other}
            onChange={(value) => set("topic_other", value)}
          />
        </div>
      )}
    </section>
  );
}

export function DescriptionStep({ form, errors, set }: StepProps) {
  return (
    <section className="card" aria-labelledby="step-title">
      <h2 id="step-title" className="card__title">
        Описание процесса
      </h2>
      <p className="card__sub" style={{ marginBottom: 18 }}>
        Пишите простыми словами, как объяснили бы коллеге. Технические подробности не нужны.
      </p>
      <TextArea
        id="process"
        label="Как процесс выполняется сейчас"
        required
        rows={5}
        maxLength={LIMITS.text}
        hint="С чего он начинается, какие действия выполняются, кто участвует и какой результат получается."
        value={form.process}
        error={errors.process}
        onChange={(value) => set("process", value)}
      />
      <TextArea
        id="problem"
        label="Что именно требует автоматизации и почему"
        required
        maxLength={LIMITS.text}
        hint="Ручные и повторяющиеся операции, ошибки, перенос данных между системами, работа с таблицами."
        value={form.problem}
        error={errors.problem}
        onChange={(value) => set("problem", value)}
      />
      <TextArea
        id="desired_result"
        label="Как процесс должен работать после автоматизации"
        required
        maxLength={LIMITS.text}
        hint="Например: «система сама получает данные, формирует отчёт и отправляет его получателю»."
        value={form.desired_result}
        error={errors.desired_result}
        onChange={(value) => set("desired_result", value)}
      />
      <TextArea
        id="method_suggestion"
        label="Предложения по способу автоматизации"
        optional
        rows={3}
        maxLength={LIMITS.text}
        value={form.method_suggestion}
        error={errors.method_suggestion}
        onChange={(value) => set("method_suggestion", value)}
      />
      <div className="field-grid" style={{ marginTop: 18 }}>
        <TextArea
          id="beneficiaries"
          label="Кто получит выгоду"
          required
          rows={3}
          maxLength={LIMITS.short}
          hint="Сотрудники, подразделения или группы, которым станет проще."
          value={form.beneficiaries}
          error={errors.beneficiaries}
          onChange={(value) => set("beneficiaries", value)}
        />
        <TextArea
          id="result_recipient"
          label="Кто получает результат процесса"
          required
          rows={3}
          maxLength={LIMITS.short}
          hint="ФИО, должность, подразделение или внешний получатель."
          value={form.result_recipient}
          error={errors.result_recipient}
          onChange={(value) => set("result_recipient", value)}
        />
      </div>
    </section>
  );
}

interface WorkloadStepProps extends StepProps {
  draftKey: string;
  documentsMeta: Record<string, DocumentInfo>;
  attachedToRequest: Set<string>;
  onDocumentAdded: (document: DocumentInfo) => void;
  onDocumentRemoved: (id: string) => void;
}

export function WorkloadStep(props: WorkloadStepProps) {
  const { form, errors, set, dictionaries } = props;
  const workload = form.workload;
  const irregular = workload.frequency === "irregular";
  const estimate = hoursPerMonth(workload.frequency, workload.duration, workload.duration_unit, workload.times_per_period, workload.employees_count);
  const period = workload.frequency && !irregular ? FREQUENCY_LABELS[workload.frequency as keyof typeof FREQUENCY_LABELS] : "за период";

  return (
    <>
      <section className="card" aria-labelledby="step-title">
        <h2 id="step-title" className="card__title">
          Текущая трудоёмкость
        </h2>
        <p className="card__sub" style={{ marginBottom: 18 }}>
          Помогает оценить эффект от автоматизации. Достаточно примерных цифр.
        </p>
        <Select
          id="workload-frequency"
          label="Как часто выполняется операция"
          required
          placeholder="Выберите вариант"
          options={FREQUENCY_OPTIONS}
          value={workload.frequency}
          error={errors["workload.frequency"]}
          onChange={(value) => set("workload.frequency", value)}
        />
        {workload.frequency && !irregular && (
          <>
            <div className="field-grid">
              <TextInput
                id="workload-duration"
                label="Сколько длится одна операция"
                required
                inputMode="decimal"
                placeholder="Например: 1,5"
                value={workload.duration}
                error={errors["workload.duration"]}
                onChange={(value) => set("workload.duration", value)}
              />
              <Select
                id="workload-duration_unit"
                label="Единица измерения"
                required
                options={UNIT_OPTIONS}
                value={workload.duration_unit}
                error={errors["workload.duration_unit"]}
                onChange={(value) => set("workload.duration_unit", value)}
              />
            </div>
            <div className="field-grid">
              <TextInput
                id="workload-times_per_period"
                label={`Сколько раз ${period}`}
                required
                inputMode="numeric"
                value={workload.times_per_period}
                error={errors["workload.times_per_period"]}
                onChange={(value) => set("workload.times_per_period", value)}
              />
              <TextInput
                id="workload-employees_count"
                label="Сколько сотрудников её выполняют"
                required
                inputMode="numeric"
                value={workload.employees_count}
                error={errors["workload.employees_count"]}
                onChange={(value) => set("workload.employees_count", value)}
              />
            </div>
            <div className="estimate" aria-live="polite">
              {estimate === null ? (
                "Заполните поля выше — здесь появится оценка трудоёмкости."
              ) : (
                <>
                  Около <strong>{formatHours(estimate)}</strong> человеко-часов в месяц.{" "}
                  <span className="muted">Оценка приблизительная: месяц считается за 21 рабочий день.</span>
                </>
              )}
            </div>
          </>
        )}
        {workload.frequency && (
          <div style={{ marginTop: 18 }}>
            <TextArea
              id="workload-note"
              label={irregular ? "Опишите, как часто возникает процесс и сколько времени он занимает" : "Дополнительно о трудоёмкости"}
              required={irregular}
              optional={!irregular}
              rows={3}
              maxLength={LIMITS.short}
              placeholder={irregular ? "Например: около 20 раз в квартал, каждый раз до часа" : undefined}
              value={workload.note}
              error={errors["workload.note"]}
              onChange={(value) => set("workload.note", value)}
            />
          </div>
        )}
      </section>

      <section className="card" aria-labelledby="documents-title">
        <h2 id="documents-title" className="card__title">
          Документы, используемые в процессе
        </h2>
        <p className="card__sub" style={{ marginBottom: 14 }}>
          Приложите формы, шаблоны или примеры отчётов — это заметно ускорит рассмотрение. Необязательно.
        </p>
        <DocumentsField
          draftKey={props.draftKey}
          refs={form.documents}
          meta={props.documentsMeta}
          attachedToRequest={props.attachedToRequest}
          dictionaries={dictionaries}
          error={errors.documents}
          onAdd={props.onDocumentAdded}
          onRemove={props.onDocumentRemoved}
          onChange={(id, key, value) =>
            set(
              "documents",
              form.documents.map((ref) => (ref.id === id ? { ...ref, [key]: value } : ref)),
            )
          }
        />
      </section>
    </>
  );
}

interface ReviewStepProps extends StepProps {
  documentsMeta: Record<string, DocumentInfo>;
  onEdit: (step: number) => void;
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <>
      <dt>{label}</dt>
      <dd className="prewrap">{children || "—"}</dd>
    </>
  );
}

function ReviewSection({ step, onEdit, children }: { step: number; onEdit: (step: number) => void; children: React.ReactNode }) {
  return (
    <section className="card">
      <div className="card__head">
        <h3 className="card__title">{STEP_TITLES[step]}</h3>
        <button type="button" className="btn btn--ghost btn--small" onClick={() => onEdit(step)}>
          Изменить<span className="visually-hidden"> раздел «{STEP_TITLES[step]}»</span>
        </button>
      </div>
      <dl className="facts">{children}</dl>
    </section>
  );
}

export function ReviewStep({ form, errors, set, dictionaries, me, documentsMeta, onEdit }: ReviewStepProps) {
  const region = dictionaries.regions.find((item) => String(item.id) === form.applicant.region_id)?.name;
  const topic = dictionaries.topics.find((item) => String(item.id) === form.topic_id);
  const workload = form.workload;
  const estimate = hoursPerMonth(workload.frequency, workload.duration, workload.duration_unit, workload.times_per_period, workload.employees_count);
  const unit = UNIT_OPTIONS.find((item) => item.value === workload.duration_unit)?.label;

  return (
    <div className="stack">
      <div className="alert alert--info">
        <div className="alert__body">
          <h2 id="step-title" className="alert__title" style={{ fontSize: 15 }}>
            Проверьте заявку перед отправкой
          </h2>
          Любой раздел можно изменить — введённые данные не потеряются.
        </div>
      </div>
      <ReviewSection step={0} onEdit={onEdit}>
        <Fact label="ФИО">{me.user.full_name}</Fact>
        <Fact label="Телефон">{form.applicant.phone}</Fact>
        <Fact label="Регион">{region}</Fact>
        <Fact label="Подразделение">{form.applicant.department}</Fact>
      </ReviewSection>
      <ReviewSection step={1} onEdit={onEdit}>
        <Fact label="Тип заявки">{form.type ? TYPE_LABELS[form.type as keyof typeof TYPE_LABELS] : ""}</Fact>
        {form.type === "upgrade" && <Fact label="Существующая система">{form.existing_system_name}</Fact>}
        <Fact label="Тематика">{topic?.requires_detail ? form.topic_other : topic?.name}</Fact>
      </ReviewSection>
      <ReviewSection step={2} onEdit={onEdit}>
        <Fact label="Как выполняется сейчас">{form.process}</Fact>
        <Fact label="Что автоматизировать">{form.problem}</Fact>
        <Fact label="Желаемый результат">{form.desired_result}</Fact>
        {form.method_suggestion.trim() && <Fact label="Предложения">{form.method_suggestion}</Fact>}
        <Fact label="Кто получит выгоду">{form.beneficiaries}</Fact>
        <Fact label="Получатель результата">{form.result_recipient}</Fact>
      </ReviewSection>
      <ReviewSection step={3} onEdit={onEdit}>
        <Fact label="Периодичность">{FREQUENCY_OPTIONS.find((item) => item.value === workload.frequency)?.label}</Fact>
        {workload.frequency !== "irregular" && (
          <>
            <Fact label="Одна операция">{workload.duration ? `${workload.duration} ${unit ?? ""}` : ""}</Fact>
            <Fact label="Повторений">{workload.times_per_period}</Fact>
            <Fact label="Сотрудников">{workload.employees_count}</Fact>
            <Fact label="Оценка">{estimate !== null ? `около ${formatHours(estimate)} в месяц` : ""}</Fact>
          </>
        )}
        {workload.note.trim() && <Fact label="Дополнительно">{workload.note}</Fact>}
        <Fact label="Документы">
          {form.documents.length ? form.documents.map((ref) => documentsMeta[ref.id]?.original_name).filter(Boolean).join(", ") : "не приложены"}
        </Fact>
      </ReviewSection>
      <section className="card">
        <Checkbox id="confirm" label="Подтверждаю, что данные указаны верно" checked={form.confirm} error={errors.confirm} onChange={(value) => set("confirm", value)} />
      </section>
    </div>
  );
}
