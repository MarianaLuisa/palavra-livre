import { useEffect, useRef, type MouseEvent } from "react";

type ConfirmDialogProps = {
  open: boolean;
  title: string;
  description: string;
  /** Aviso extra em destaque, para ações irreversíveis. */
  warning?: string;
  confirmLabel: string;
  cancelLabel?: string;
  /** Usa o visual de perigo no botão de confirmação. */
  danger?: boolean;
  busy?: boolean;
  onConfirm: () => void;
  onCancel: () => void;
};

/** Confirmação reutilizável para as ações administrativas sensíveis. */
export function ConfirmDialog({
  open,
  title,
  description,
  warning,
  confirmLabel,
  cancelLabel = "Cancelar",
  danger = false,
  busy = false,
  onConfirm,
  onCancel,
}: ConfirmDialogProps) {
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (open) {
      confirmRef.current?.focus();
    }
  }, [open]);

  useEffect(() => {
    if (!open) {
      return;
    }

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape" && !busy) {
        onCancel();
      }
    }

    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [busy, onCancel, open]);

  if (!open) {
    return null;
  }

  function handleBackdropClick(event: MouseEvent<HTMLDivElement>) {
    if (event.target === event.currentTarget && !busy) {
      onCancel();
    }
  }

  return (
    <div className="modal-backdrop" role="presentation" onClick={handleBackdropClick}>
      <section
        className="modal confirm-dialog"
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="confirm-title"
        aria-describedby="confirm-description"
      >
        <h2 id="confirm-title">{title}</h2>
        <p id="confirm-description" className="confirm-description">
          {description}
        </p>
        {warning !== undefined ? <p className="confirm-warning">{warning}</p> : null}
        <div className="modal-actions confirm-actions">
          <button
            className="secondary-button"
            type="button"
            onClick={onCancel}
            disabled={busy}
          >
            {cancelLabel}
          </button>
          <button
            ref={confirmRef}
            className={danger ? "danger-button" : "primary-button"}
            type="button"
            onClick={onConfirm}
            disabled={busy}
          >
            {busy ? "Executando..." : confirmLabel}
          </button>
        </div>
      </section>
    </div>
  );
}
