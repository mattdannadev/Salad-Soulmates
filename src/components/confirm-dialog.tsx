'use client';

import { useEffect, useId, useRef } from 'react';
import ActionButton from './action-button';
import styles from './confirm-dialog.module.css';

export interface ConfirmDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  cancelLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  pending?: boolean;
  pendingLabel?: string;
}

/** Controlled confirmation. The owner closes it after cancellation or completion. */
export default function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  cancelLabel,
  onConfirm,
  onCancel,
  pending = false,
  pendingLabel = undefined,
}: ConfirmDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const descriptionId = useId();

  useEffect(() => {
    if (!open) return undefined;

    const dialog = dialogRef.current;
    if (!dialog) return undefined;

    const previouslyFocused = document.activeElement;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector('button')?.focus();

    return () => {
      if (dialog.open) dialog.close();
      if (previouslyFocused instanceof HTMLElement && previouslyFocused.isConnected) {
        previouslyFocused.focus();
      }
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={styles.dialog}
      aria-labelledby={titleId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        event.preventDefault();
        if (!pending) onCancel();
      }}
    >
      <h2 id={titleId}>{title}</h2>
      <p id={descriptionId}>{description}</p>
      <div className={styles.actions}>
        <ActionButton
          variant="secondary"
          disabled={pending}
          onClick={onCancel}
        >
          {cancelLabel}
        </ActionButton>
        <ActionButton
          variant="destructive"
          pending={pending}
          pendingLabel={pendingLabel}
          onClick={onConfirm}
        >
          {confirmLabel}
        </ActionButton>
      </div>
    </dialog>
  );
}
