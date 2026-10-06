'use client';

import {
  useEffect, useId, useRef, type ReactNode,
} from 'react';
import { X } from 'lucide-react';
import { useRouter } from 'next/navigation';
import styles from './creation-dialog.module.css';

export interface CreationDialogProps {
  open: boolean;
  title: string;
  description?: string;
  closeHref: string;
  closeLabel: string;
  children: ReactNode;
  size?: 'standard' | 'wide';
}

/**
 * Hosts a server-provided creation form in a URL-addressable native dialog.
 * Closing only removes the creation state, so directory filters and drafts persist.
 */
export default function CreationDialog({
  open,
  title,
  description = undefined,
  closeHref,
  closeLabel,
  children,
  size = 'wide',
}: CreationDialogProps) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const openerRef = useRef<HTMLElement | null>(null);
  const titleId = useId();
  const descriptionId = useId();
  const router = useRouter();

  const close = () => router.replace(closeHref, { scroll: false });

  useEffect(() => {
    if (!open) return undefined;
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const { activeElement } = document;
    openerRef.current = activeElement instanceof HTMLElement ? activeElement : null;
    if (!dialog.open) dialog.showModal();
    dialog.querySelector<HTMLElement>('[data-dialog-initial-focus]')?.focus();
    return () => {
      if (dialog.open) dialog.close();
      if (openerRef.current?.isConnected) openerRef.current.focus();
    };
  }, [open]);

  return (
    <dialog
      ref={dialogRef}
      className={`${styles.dialog} ${size === 'wide' ? styles.wide : ''}`}
      aria-labelledby={titleId}
      aria-describedby={description ? descriptionId : undefined}
      onCancel={(event) => {
        event.preventDefault();
        close();
      }}
    >
      <div className={styles.header}>
        <div>
          <h2 id={titleId} tabIndex={-1} data-dialog-initial-focus>
            {title}
          </h2>
          {description && <p id={descriptionId}>{description}</p>}
        </div>
        <button type="button" className={styles.close} aria-label={closeLabel} onClick={close}>
          <X size={18} aria-hidden />
        </button>
      </div>
      <div className={styles.content}>{children}</div>
    </dialog>
  );
}
