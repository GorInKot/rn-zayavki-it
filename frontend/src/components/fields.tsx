import { forwardRef, type ReactNode } from "react";

interface BaseProps {
  id: string;
  label: ReactNode;
  hint?: ReactNode;
  error?: string;
  required?: boolean;
  optional?: boolean;
}

function describedBy(id: string, hint?: ReactNode, error?: string): string | undefined {
  return [hint ? `${id}-hint` : null, error ? `${id}-error` : null].filter(Boolean).join(" ") || undefined;
}

function FieldShell({ id, label, hint, error, required, optional, children, after }: BaseProps & { children: ReactNode; after?: ReactNode }) {
  return (
    <div className="field">
      <label htmlFor={id} className="field__label">
        {label}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
        {optional && <span className="field__optional"> — необязательно</span>}
      </label>
      {hint && (
        <div id={`${id}-hint`} className="field__hint">
          {hint}
        </div>
      )}
      {children}
      {after}
      {error && (
        <div id={`${id}-error`} className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}

interface TextInputProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  type?: "text" | "email" | "tel" | "date" | "search";
  inputMode?: "text" | "decimal" | "numeric" | "tel" | "email" | "search";
  autoComplete?: string;
  maxLength?: number;
  placeholder?: string;
  readOnly?: boolean;
  min?: string;
  max?: string;
}

export const TextInput = forwardRef<HTMLInputElement, TextInputProps>(function TextInput(
  { value, onChange, type = "text", inputMode, autoComplete, maxLength, placeholder, readOnly, min, max, ...base },
  ref,
) {
  return (
    <FieldShell {...base}>
      <input
        ref={ref}
        id={base.id}
        name={base.id}
        className="input"
        type={type}
        value={value}
        onChange={(event) => onChange(event.target.value)}
        inputMode={inputMode}
        autoComplete={autoComplete}
        maxLength={maxLength}
        placeholder={placeholder}
        readOnly={readOnly}
        min={min}
        max={max}
        aria-invalid={base.error ? true : undefined}
        aria-required={base.required || undefined}
        aria-describedby={describedBy(base.id, base.hint, base.error)}
      />
    </FieldShell>
  );
});

interface TextAreaProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  rows?: number;
  maxLength: number;
  placeholder?: string;
}

export function TextArea({ value, onChange, rows = 4, maxLength, placeholder, ...base }: TextAreaProps) {
  const nearLimit = value.length > maxLength * 0.85;
  const counter = nearLimit ? (
    <div className={`field__counter${value.length > maxLength ? " field__counter--over" : ""}`} aria-live="polite">
      {value.length} из {maxLength} символов
    </div>
  ) : null;
  return (
    <FieldShell {...base} after={counter}>
      <textarea
        id={base.id}
        name={base.id}
        className="textarea"
        rows={rows}
        value={value}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={base.error ? true : undefined}
        aria-required={base.required || undefined}
        aria-describedby={describedBy(base.id, base.hint, base.error)}
      />
    </FieldShell>
  );
}

interface SelectProps extends BaseProps {
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string }[];
  placeholder?: string;
}

export function Select({ value, onChange, options, placeholder, ...base }: SelectProps) {
  return (
    <FieldShell {...base}>
      <select
        id={base.id}
        name={base.id}
        className="select"
        value={value}
        onChange={(event) => onChange(event.target.value)}
        aria-invalid={base.error ? true : undefined}
        aria-required={base.required || undefined}
        aria-describedby={describedBy(base.id, base.hint, base.error)}
      >
        {placeholder !== undefined && <option value="">{placeholder}</option>}
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </FieldShell>
  );
}

interface ChoiceGroupProps {
  id: string;
  legend: ReactNode;
  value: string;
  onChange: (value: string) => void;
  options: { value: string; label: string; description?: string }[];
  error?: string;
  hint?: ReactNode;
  required?: boolean;
  minWidth?: number;
}

/** Выбор из карточек на настоящих radio: работает с клавиатуры стрелками и озвучивается скринридером. */
export function ChoiceGroup({ id, legend, value, onChange, options, error, hint, required, minWidth }: ChoiceGroupProps) {
  const describe = describedBy(id, hint, error);
  return (
    <fieldset className="choice" id={id} aria-invalid={error ? true : undefined} aria-describedby={describe} tabIndex={-1}>
      <legend className="field__label">
        {legend}
        {required && (
          <span className="field__required" aria-hidden="true">
            *
          </span>
        )}
      </legend>
      {hint && (
        <div id={`${id}-hint`} className="field__hint" style={{ marginBottom: 8 }}>
          {hint}
        </div>
      )}
      <div className="choice__options" style={minWidth ? ({ "--choice-min": `${minWidth}px` } as React.CSSProperties) : undefined}>
        {options.map((option) => {
          // Название — имя кнопки, пояснение — её описание: скринридер не зачитывает всё одной фразой.
          const optionId = `${id}-option-${option.value}`;
          return (
            <label key={option.value} className="choice__option">
              <input
                type="radio"
                name={id}
                value={option.value}
                checked={value === option.value}
                onChange={() => onChange(option.value)}
                aria-required={required || undefined}
                aria-labelledby={`${optionId}-title`}
                aria-describedby={option.description ? `${optionId}-desc` : undefined}
              />
              <span id={`${optionId}-title`} className="choice__title">
                {option.label}
              </span>
              {option.description && (
                <span id={`${optionId}-desc`} className="choice__desc">
                  {option.description}
                </span>
              )}
            </label>
          );
        })}
      </div>
      {error && (
        <div id={`${id}-error`} className="field__error" style={{ marginTop: 6 }}>
          {error}
        </div>
      )}
    </fieldset>
  );
}

interface CheckboxProps {
  id: string;
  label: ReactNode;
  checked: boolean;
  onChange: (checked: boolean) => void;
  error?: string;
}

export function Checkbox({ id, label, checked, onChange, error }: CheckboxProps) {
  return (
    <div className="field">
      <label className="checkbox" htmlFor={id}>
        <input
          id={id}
          name={id}
          type="checkbox"
          checked={checked}
          onChange={(event) => onChange(event.target.checked)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-error` : undefined}
        />
        <span>{label}</span>
      </label>
      {error && (
        <div id={`${id}-error`} className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}

export function focusField(id: string) {
  const element = document.getElementById(id);
  if (!element) return;
  const target = element.matches("fieldset") ? element.querySelector<HTMLInputElement>("input") ?? element : element;
  target.focus({ preventScroll: true });
  element.scrollIntoView({ block: "center", behavior: "smooth" });
}
