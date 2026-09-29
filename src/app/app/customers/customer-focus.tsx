'use client';

import { useEffect } from 'react';

/** Restore focus after the customer grid has hydrated. */
export default function CustomerFocus({ rowId }: { rowId: string }) {
  useEffect(() => {
    const focusRow = () => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('.ag-row[row-id]'))
        .find((candidate) => candidate.getAttribute('row-id') === rowId);
      const link = row?.querySelector<HTMLAnchorElement>('a[href]');
      if (!link) return false;
      link.focus();
      const url = new URL(window.location.href);
      if (url.searchParams.get('focusRow') === rowId) {
        url.searchParams.delete('focusRow');
        window.history.replaceState(window.history.state, '', `${url.pathname}${url.search}${url.hash}`);
      }
      return true;
    };
    if (focusRow()) return undefined;
    const observer = new MutationObserver(() => {
      if (focusRow()) observer.disconnect();
    });
    observer.observe(document.body, { childList: true, subtree: true });
    const timeout = window.setTimeout(() => observer.disconnect(), 5000);
    return () => {
      observer.disconnect();
      window.clearTimeout(timeout);
    };
  }, [rowId]);
  return null;
}
