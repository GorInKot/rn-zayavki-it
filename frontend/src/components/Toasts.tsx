import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";

type Tone = "info" | "error";
interface Toast {
  id: number;
  text: string;
  tone: Tone;
}

const ToastContext = createContext<(text: string, tone?: Tone) => void>(() => undefined);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const nextId = useRef(1);

  const dismiss = useCallback((id: number) => setToasts((current) => current.filter((toast) => toast.id !== id)), []);

  const push = useCallback(
    (text: string, tone: Tone = "info") => {
      const id = nextId.current++;
      setToasts((current) => [...current.slice(-3), { id, text, tone }]);
      // Сообщения об ошибках не исчезают сами: их нужно успеть прочитать.
      if (tone === "info") window.setTimeout(() => dismiss(id), 7000);
    },
    [dismiss],
  );

  const value = useMemo(() => push, [push]);
  const render = (tone: Tone) =>
    toasts
      .filter((toast) => toast.tone === tone)
      .map((toast) => (
        <div key={toast.id} className={`toast toast--${toast.tone}`}>
          <span className="toast__text">{toast.text}</span>
          <button type="button" className="toast__close" onClick={() => dismiss(toast.id)} aria-label="Закрыть сообщение">
            ×
          </button>
        </div>
      ));

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="toasts">
        <div role="status" aria-live="polite" style={{ display: "contents" }}>
          {render("info")}
        </div>
        <div role="alert" aria-live="assertive" style={{ display: "contents" }}>
          {render("error")}
        </div>
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}
