import { useCallback, useEffect, useRef, useState } from "react";

import { api, ApiError } from "../../api/client";
import type { Draft } from "../../api/types";

export type SaveState =
  | { kind: "idle" }
  | { kind: "pending" }
  | { kind: "saving" }
  | { kind: "saved"; at: string }
  | { kind: "error"; message: string }
  | { kind: "conflict" };

const DEBOUNCE_MS = 900;

/**
 * Черновик сохраняется на сервере. Запросы идут строго по очереди и несут версию черновика:
 * если форму параллельно правят в другой вкладке, сервер ответит конфликтом, и данные не перезапишутся молча.
 */
export function useAutosave<T>(draftKey: string, form: T, initialVersion: number | null) {
  const [state, setState] = useState<SaveState>({ kind: "idle" });
  const latest = useRef(form);
  const version = useRef<number | null>(initialVersion);
  const dirty = useRef(false);
  const conflict = useRef(false);
  const inFlight = useRef<Promise<void> | null>(null);
  const timer = useRef<number | undefined>(undefined);

  latest.current = form;

  const flush = useCallback(async (): Promise<boolean> => {
    window.clearTimeout(timer.current);
    if (inFlight.current) await inFlight.current;
    if (!dirty.current || conflict.current) return !dirty.current;

    dirty.current = false;
    setState({ kind: "saving" });
    const request = api<Draft>(`/drafts/${draftKey}`, { method: "PUT", body: { data: latest.current, version: version.current || null } })
      .then((draft) => {
        version.current = draft.version;
        setState(dirty.current ? { kind: "pending" } : { kind: "saved", at: draft.updated_at });
      })
      .catch((error: unknown) => {
        if (error instanceof ApiError && error.code === "stale_draft") {
          conflict.current = true;
          setState({ kind: "conflict" });
          return;
        }
        dirty.current = true;
        setState({ kind: "error", message: error instanceof ApiError ? error.message : "Не удалось сохранить черновик" });
      })
      .finally(() => {
        inFlight.current = null;
      });
    inFlight.current = request;
    await request;
    return !dirty.current && !conflict.current;
  }, [draftKey]);

  const markDirty = useCallback(() => {
    dirty.current = true;
    if (conflict.current) return;
    setState({ kind: "pending" });
    window.clearTimeout(timer.current);
    timer.current = window.setTimeout(() => void flush(), DEBOUNCE_MS);
  }, [flush]);

  const hasUnsaved = useCallback(() => dirty.current || inFlight.current !== null, []);

  const reset = useCallback((nextVersion: number | null) => {
    window.clearTimeout(timer.current);
    dirty.current = false;
    conflict.current = false;
    version.current = nextVersion;
    setState({ kind: "idle" });
  }, []);

  useEffect(() => {
    const warn = (event: BeforeUnloadEvent) => {
      if (dirty.current || inFlight.current) {
        event.preventDefault();
        event.returnValue = "";
      }
    };
    window.addEventListener("beforeunload", warn);
    return () => {
      window.removeEventListener("beforeunload", warn);
      window.clearTimeout(timer.current);
    };
  }, []);

  return { state, markDirty, flush, hasUnsaved, reset };
}
