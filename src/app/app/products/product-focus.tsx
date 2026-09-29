'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';

const HASH_PREFIX = '#product-';

/** Restore a product hash across a paged result set and focus its detail control. */
export default function ProductFocus({
  filteredIds, allIds, page, pageSize, locale,
}: {
  filteredIds: string[];
  allIds: string[];
  page: number;
  pageSize: number;
  locale: 'en' | 'es';
}) {
  const router = useRouter();
  const [outsideViewId, setOutsideViewId] = useState<string>();

  useEffect(() => {
    let observer: MutationObserver | undefined;
    let timeout: number | undefined;
    const stop = () => {
      observer?.disconnect();
      if (timeout !== undefined) window.clearTimeout(timeout);
    };
    const restore = () => {
      stop();
      const { hash } = window.location;
      if (!hash.startsWith(HASH_PREFIX)) {
        setOutsideViewId(undefined);
        return;
      }
      const id = hash.slice(HASH_PREFIX.length);
      if (!allIds.includes(id)) {
        setOutsideViewId(undefined);
        return;
      }
      const index = filteredIds.indexOf(id);
      if (index < 0) {
        setOutsideViewId(id);
        return;
      }
      setOutsideViewId(undefined);
      const targetPage = Math.floor(index / pageSize) + 1;
      if (targetPage !== page) {
        const url = new URL(window.location.href);
        if (targetPage === 1) url.searchParams.delete('page');
        else url.searchParams.set('page', String(targetPage));
        router.replace(`${url.pathname}${url.search}${url.hash}`, { scroll: false });
        return;
      }
      const focus = () => {
        const details = document.getElementById(`product-${id}`);
        if (!(details instanceof HTMLDetailsElement)) return false;
        details.open = true;
        details.querySelector<HTMLElement>('summary')?.focus();
        stop();
        return true;
      };
      if (focus()) return;
      observer = new MutationObserver(focus);
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(stop, 5000);
    };
    restore();
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('hashchange', restore);
      stop();
    };
  }, [allIds, filteredIds, page, pageSize, router]);

  if (!outsideViewId) return null;
  return (
    <p role="status">
      {locale === 'es' ? 'El producto está fuera de esta vista. ' : 'The product is outside this view. '}
      <Link href={`/app/products#product-${outsideViewId}`}>
        {locale === 'es' ? 'Mostrar producto' : 'Show product'}
      </Link>
    </p>
  );
}
