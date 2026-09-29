'use client';

import { useEffect } from 'react';

/** Restore keyboard focus to a returned ingredient when the grid finishes mounting. */
export default function IngredientFocus({ rowId }: { rowId: string }) {
  useEffect(() => {
    const focusRow = () => {
      const row = Array.from(document.querySelectorAll<HTMLElement>('.ag-row[row-id]'))
        .find((candidate) => candidate.getAttribute('row-id') === rowId);
      const link = row?.querySelector<HTMLAnchorElement>('a[href]');
      if (!link) return false;
      link.focus();
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
