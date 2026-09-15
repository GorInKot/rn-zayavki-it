import { useRef, useState } from "react";

import { api, ApiError } from "../../api/client";
import type { Dictionaries, DocumentInfo } from "../../api/types";
import { TextArea } from "../../components/fields";
import { fileSize } from "../../lib/format";
import { LIMITS, type DocumentRef } from "../../lib/requestForm";

interface Props {
  draftKey: string;
  refs: DocumentRef[];
  meta: Record<string, DocumentInfo>;
  attachedToRequest: Set<string>;
  dictionaries: Dictionaries;
  error?: string;
  onAdd: (document: DocumentInfo) => void;
  onRemove: (id: string) => void;
  onChange: (id: string, key: "usage" | "future_use", value: string) => void;
}

interface UploadState {
  key: number;
  name: string;
  error: string | null;
}

export function DocumentsField({ draftKey, refs, meta, attachedToRequest, dictionaries, error, onAdd, onRemove, onChange }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [dragDepth, setDragDepth] = useState(0);
  const [uploads, setUploads] = useState<UploadState[]>([]);
  const [removing, setRemoving] = useState<string | null>(null);
  const counter = useRef(0);
  const limit = dictionaries.max_files_per_request;
  const full = refs.length >= limit;

  const updateUpload = (key: number, patch: Partial<UploadState> | null) =>
    setUploads((current) => (patch === null ? current.filter((item) => item.key !== key) : current.map((item) => (item.key === key ? { ...item, ...patch } : item))));

  async function upload(files: FileList | File[]) {
    let count = refs.length;
    for (const file of Array.from(files)) {
      const key = counter.current++;
      setUploads((current) => [...current, { key, name: file.name, error: null }]);
      const extension = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase() : "";
      if (count >= limit) {
        updateUpload(key, { error: `не загружен: к заявке можно приложить не более ${limit} файлов` });
        continue;
      }
      if (!dictionaries.allowed_extensions.includes(extension)) {
        updateUpload(key, { error: "не загружен: такой тип файлов не принимается" });
        continue;
      }
      if (file.size > dictionaries.max_upload_mb * 1024 * 1024) {
        updateUpload(key, { error: `не загружен: файл больше ${dictionaries.max_upload_mb} МБ` });
        continue;
      }
      if (file.size === 0) {
        updateUpload(key, { error: "не загружен: файл пустой" });
        continue;
      }
      const form = new FormData();
      form.append("file", file);
      try {
        const document = await api<DocumentInfo>(`/drafts/${draftKey}/documents`, { method: "POST", form });
        count += 1;
        onAdd(document);
        updateUpload(key, null);
      } catch (uploadError) {
        updateUpload(key, { error: uploadError instanceof ApiError ? uploadError.message : "не загружен из-за ошибки сети" });
      }
    }
  }

  async function remove(id: string) {
    if (attachedToRequest.has(id)) {
      onRemove(id);
      return;
    }
    setRemoving(id);
    try {
      await api(`/drafts/${draftKey}/documents/${id}`, { method: "DELETE" });
      onRemove(id);
    } catch (removeError) {
      if (removeError instanceof ApiError && removeError.status === 404) onRemove(id);
      else setUploads((current) => [...current, { key: counter.current++, name: meta[id]?.original_name ?? "Файл", error: "не удалось удалить — повторите" }]);
    } finally {
      setRemoving(null);
    }
  }

  return (
    <div className="field" id="documents" tabIndex={-1}>
      <div
        className={`dropzone${dragDepth > 0 ? " dropzone--active" : ""}`}
        aria-disabled={full || undefined}
        onClick={() => !full && input.current?.click()}
        onDragEnter={(event) => {
          event.preventDefault();
          setDragDepth((depth) => depth + 1);
        }}
        onDragLeave={() => setDragDepth((depth) => Math.max(0, depth - 1))}
        onDragOver={(event) => event.preventDefault()}
        onDrop={(event) => {
          event.preventDefault();
          setDragDepth(0);
          if (!full) void upload(event.dataTransfer.files);
        }}
      >
        <p>
          <strong>Перетащите файлы сюда</strong> или
        </p>
        <button
          type="button"
          className="btn btn--secondary btn--small"
          style={{ marginTop: 8 }}
          disabled={full}
          aria-describedby="documents-rules"
          onClick={(event) => {
            event.stopPropagation();
            input.current?.click();
          }}
        >
          Выбрать файлы
        </button>
        <p id="documents-rules" className="small muted" style={{ marginTop: 8 }}>
          {full
            ? `Приложено максимальное число файлов — ${limit}.`
            : `До ${limit} файлов, каждый до ${dictionaries.max_upload_mb} МБ: ${dictionaries.allowed_extensions.join(", ")}.`}
        </p>
        <input
          ref={input}
          type="file"
          multiple
          hidden
          accept={dictionaries.allowed_extensions.map((extension) => `.${extension}`).join(",")}
          onChange={(event) => {
            if (event.target.files) void upload(event.target.files);
            event.target.value = "";
          }}
        />
      </div>

      <div aria-live="polite">
        {uploads.length > 0 && (
          <ul className="files">
            {uploads.map((item) => (
              <li key={item.key} className={`alert ${item.error ? "alert--danger" : "alert--info"}`}>
                <div className="alert__body">
                  «{item.name}» {item.error ?? "загружается…"}
                </div>
                {item.error && (
                  <button type="button" className="btn btn--ghost btn--small" onClick={() => updateUpload(item.key, null)}>
                    Скрыть
                  </button>
                )}
              </li>
            ))}
          </ul>
        )}
      </div>

      {refs.length > 0 && (
        <ul className="files" aria-label="Приложенные файлы">
          {refs.map((ref) => {
            const document = meta[ref.id];
            if (!document) return null;
            return (
              <li key={ref.id} className="file">
                <div className="file__head">
                  <span className="file__ext" aria-hidden="true">
                    {document.extension}
                  </span>
                  <div className="file__meta">
                    <div className="file__name">{document.original_name}</div>
                    <div className="small muted">{fileSize(document.size_bytes)}</div>
                  </div>
                  <button
                    type="button"
                    className="btn btn--ghost btn--small"
                    onClick={() => void remove(ref.id)}
                    disabled={removing === ref.id}
                    aria-label={`Убрать файл «${document.original_name}»`}
                  >
                    {removing === ref.id ? "Удаляем…" : "Убрать"}
                  </button>
                </div>
                <div className="file__body field-grid">
                  <TextArea
                    id={`document-${ref.id}-usage`}
                    label="Что используется из документа"
                    optional
                    rows={2}
                    maxLength={LIMITS.short}
                    placeholder="Например: столбцы 1, 3 и 7 из Excel"
                    value={ref.usage}
                    onChange={(value) => onChange(ref.id, "usage", value)}
                  />
                  <TextArea
                    id={`document-${ref.id}-future`}
                    label="Как он должен использоваться после автоматизации"
                    optional
                    rows={2}
                    maxLength={LIMITS.short}
                    placeholder="Например: данные подставляются автоматически"
                    value={ref.future_use}
                    onChange={(value) => onChange(ref.id, "future_use", value)}
                  />
                </div>
              </li>
            );
          })}
        </ul>
      )}
      {[...attachedToRequest].some((id) => !refs.find((ref) => ref.id === id)) && (
        <p className="small muted" style={{ marginTop: 8 }}>
          Убранные файлы исчезнут из заявки после повторной отправки. До этого заявка остаётся без изменений.
        </p>
      )}
      {error && (
        <div id="documents-error" className="field__error">
          {error}
        </div>
      )}
    </div>
  );
}
