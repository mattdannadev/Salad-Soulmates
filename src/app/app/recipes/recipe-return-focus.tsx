'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { recipePageForRow } from './directory-query';

const HASH_PREFIX = '#recipe-';

export default function RecipeReturnFocus({
  filteredRecipeIds, allRecipeIds, page, pageSize, locale,
}: {
  filteredRecipeIds: string[];
  allRecipeIds: string[];
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
      if (!allRecipeIds.includes(id)) {
        setOutsideViewId(undefined);
        return;
      }
      const targetPage = recipePageForRow(filteredRecipeIds, id, pageSize);
      if (targetPage === undefined) {
        setOutsideViewId(id);
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
          .find((candidate) => candidate.getAttribute('row-id') === id);
        const link = row?.querySelector<HTMLAnchorElement>('a[href]');
        if (!link) return false;
        link.focus();
        stop();
        return true;
      };
      if (focusLink()) return;
      observer = new MutationObserver(focusLink);
      observer.observe(document.body, { childList: true, subtree: true });
      timeout = window.setTimeout(stop, 5000);
    };
    restore();
    window.addEventListener('hashchange', restore);
    return () => {
      window.removeEventListener('hashchange', restore);
      stop();
    };
  }, [filteredRecipeIds, allRecipeIds, page, pageSize, router]);

  if (!outsideViewId) return null;
  return (
    <p role="status">
      {locale === 'es' ? 'La receta está fuera de esta vista. ' : 'The recipe is outside this view. '}
      <Link href={`/app/recipes#recipe-${outsideViewId}`}>
        {locale === 'es' ? 'Mostrar receta' : 'Show recipe'}
      </Link>
    </p>
  );
}
