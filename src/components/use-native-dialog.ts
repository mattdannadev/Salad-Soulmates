'use client';

import { useRef } from 'react';
import type { MouseEvent, SyntheticEvent } from 'react';

/** Focus and dismissal behavior for imperative native dialogs. */
export default function useNativeDialog(pending = false) {
  const dialog = useRef<HTMLDialogElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  function openDialog(source: MouseEvent<HTMLElement> | HTMLElement) {
    opener.current = source instanceof HTMLElement ? source : source.currentTarget;
    if (!dialog.current?.open) dialog.current?.showModal();
  }

  function closeDialog() {
    if (!pending && dialog.current?.open) dialog.current.close();
  }

  function closeAfterAction() {
    if (dialog.current?.open) dialog.current.close();
  }

  function onCancel(event: SyntheticEvent<HTMLDialogElement>) {
    if (pending) event.preventDefault();
  }

  function onClose() {
    if (opener.current?.isConnected) opener.current.focus();
    opener.current = null;
  }

  return {
    dialog, openDialog, closeDialog, closeAfterAction, onCancel, onClose,
  };
}
