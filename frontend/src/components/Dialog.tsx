import { useEffect, useId, useRef, type ReactNode } from "react";

interface DialogProps {
  open: boolean;
  title: string;
  description?: ReactNode;
  onClose: () => void;
  children?: ReactNode;
  footer: ReactNode;
  onSubmit?: () => void;
}

/** Нативный <dialog>: фокус внутри окна, Escape закрывает, фон недоступен, фокус возвращается на кнопку. */
export function Dialog({ open, title, description, onClose, children, footer, onSubmit }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    // Окно часто удаляется из DOM вместе с родителем, минуя close() — тогда браузер не вернёт фокус сам.
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    if (!dialog.open) dialog.showModal();
    return () => {
      if (dialog.open) dialog.close();
      if (previous?.isConnected) previous.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={ref}
      className="dialog"
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        onClose();
      }}
      onMouseDown={(event) => {
        if (event.target === ref.current) onClose();
      }}
    >
      {open && (
        <form
          className="dialog__form"
          noValidate
          onSubmit={(event) => {
            event.preventDefault();
            onSubmit?.();
          }}
        >
          <div className="dialog__head">
            <h2 id={titleId}>{title}</h2>
            {description && (
              <div id={descriptionId} className="muted small" style={{ marginTop: 6 }}>
                {description}
              </div>
            )}
          </div>
          {children && <div className="dialog__body">{children}</div>}
          <div className="dialog__foot">{footer}</div>
        </form>
      )}
    </dialog>
  );
}
