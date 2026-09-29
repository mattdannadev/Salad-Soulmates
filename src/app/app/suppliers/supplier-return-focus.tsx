'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { supplierPageForRow } from './directory-query';

const HASH_PREFIX = '#supplier-';
const FOCUS_WAIT_MS = 5000;

/** Reveal and focus a supplier reached through the directory's detail hash. */
export default function SupplierReturnFocus({
  filteredSupplierIds, allSupplierIds, page, pageSize, locale,
}: {
  filteredSupplierIds: string[];
  allSupplierIds: string[];
  page: number;
  pageSize: number;
  locale: 'en' | 'es';
}) {
  const router = useRouter();
  const [outsideViewId, setOutsideViewId] = useState<string>();

  useEffect(() => {
    let observer: MutationObserver | undefined;
    let timeout: number | undefined;

    const stopObserving = () => {
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };

    const restoreFocus = () => {
      stopObserving();
      const { hash } = window.location;
      if (!hash.startsWith(HASH_PREFIX)) {
        setOutsideViewId(undefined);
        return;
      }
      const supplierId = hash.slice(HASH_PREFIX.length);
      if (!allSupplierIds.includes(supplierId)) {
        setOutsideViewId(undefined);
        return;
      }
      const targetPage = supplierPageForRow(filteredSupplierIds, supplierId, pageSize);
      if (targetPage === undefined) {
        setOutsideViewId(supplierId);
        return;
      }
      setOutsideViewId(undefined);
      if (targetPage !== page) {
        const url = new URL(window.location.href);
        if (targetPage === 1) url.searchParams.delete('page');
        else url.searchParams.set('page', String(targetPage));
        router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
        return;
      }

      const focusLink = () => {
        const row = Array.from(document.querySelectorAll<HTMLElement>('.ag-row[row-id]'))
          .find((candidate) => candidate.getAttribute('row-id') === supplierId);
        const link = row?.querySelector<HTMLAnchorElement>('a[href]');
        if (!link) return false;
        link.focus();
        stopObserving();
        return true;
      };
      if (focusLink()) return;
      observer = new MutationObserver(focusLink);
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(stopObserving, FOCUS_WAIT_MS);
    };

    restoreFocus();
    window.addEventListener('hashchange', restoreFocus);
    return () => {
      window.removeEventListener('hashchange', restoreFocus);
      stopObserving();
    };
  }, [allSupplierIds, filteredSupplierIds, page, pageSize, router]);

  if (!outsideViewId) return null;
  return (
    <p role="status">
      {locale === 'es'
        ? 'El proveedor guardado está fuera de esta vista. '
        : 'The saved supplier is outside this view. '}
      <Link href={`/app/suppliers#supplier-${outsideViewId}`}>
        {locale === 'es' ? 'Mostrar proveedor' : 'Show supplier'}
      </Link>
    </p>
  );
}
