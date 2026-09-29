'use client';

import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useId, type FormEvent } from 'react';
import styles from './directory-toolbar.module.css';

const MAX_SEARCH_LENGTH = 200;
const MAX_PAGE = 1_000_000;
const RESERVED_KEYS = new Set(['q', 'sort', 'page']);

export interface DirectoryOption { value: string; label: string }
export interface DirectoryFilter {
  key: string;
  label: string;
  options: readonly DirectoryOption[];
}
export interface DirectoryQueryConfig {
  filters: readonly DirectoryFilter[];
  sortOptions: readonly DirectoryOption[];
}
export interface DirectoryQuery {
  q: string;
  filters: Record<string, string>;
  sort: string;
  page: number;
}
export interface DirectoryQueryPatch {
  q?: string;
  filters?: Record<string, string | null>;
  sort?: string;
  page?: number;
}

function singleValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] ?? null : null;
}

function validFilter(filter: DirectoryFilter): boolean {
  return /^[a-z][a-z0-9_-]*$/i.test(filter.key) && !RESERVED_KEYS.has(filter.key);
}

/** Accepts configured, single-valued directory parameters; invalid input uses defaults. */
export function parseDirectoryQuery(
  search: string | URLSearchParams,
  config: DirectoryQueryConfig,
): DirectoryQuery {
  const params = new URLSearchParams(search);
  const rawQ = singleValue(params, 'q')?.trim() ?? '';
  const q = rawQ.length <= MAX_SEARCH_LENGTH ? rawQ : '';
  const filters: Record<string, string> = {};
  config.filters.filter(validFilter).forEach((filter) => {
    const value = singleValue(params, filter.key);
    if (value && filter.options.some((option) => option.value === value)) {
      filters[filter.key] = value;
    }
  });
  const rawSort = singleValue(params, 'sort');
  const sort = config.sortOptions.some((option) => option.value === rawSort)
    ? rawSort ?? '' : '';
  const rawPage = singleValue(params, 'page');
  const pageNumber = rawPage && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(pageNumber) && pageNumber <= MAX_PAGE ? pageNumber : 1;
  return {
    q, filters, sort, page,
  };
}

/** Updates only configured directory keys, retaining unrelated URL state. */
export function updateDirectoryQuery(
  search: string | URLSearchParams,
  config: DirectoryQueryConfig,
  patch: DirectoryQueryPatch,
): URLSearchParams {
  const next = new URLSearchParams(search);
  let criteriaChanged = false;
  if (patch.q !== undefined) {
    next.delete('q');
    const q = patch.q.trim();
    if (q && q.length <= MAX_SEARCH_LENGTH) next.set('q', q);
    criteriaChanged = true;
  }
  if (patch.filters) {
    config.filters.filter(validFilter).forEach((filter) => {
      if (!Object.hasOwn(patch.filters ?? {}, filter.key)) return;
      next.delete(filter.key);
      const value = patch.filters?.[filter.key];
      if (value && filter.options.some((option) => option.value === value)) {
        next.set(filter.key, value);
      }
      criteriaChanged = true;
    });
  }
  if (patch.sort !== undefined) {
    next.delete('sort');
    if (config.sortOptions.some((option) => option.value === patch.sort)) next.set('sort', patch.sort);
    criteriaChanged = true;
  }
  if (patch.page !== undefined || criteriaChanged) {
    next.delete('page');
    if (!criteriaChanged && patch.page && Number.isSafeInteger(patch.page)
      && patch.page > 1 && patch.page <= MAX_PAGE) next.set('page', String(patch.page));
  }
  return next;
}

export function clearDirectoryQuery(
  search: string | URLSearchParams,
  config: DirectoryQueryConfig,
): URLSearchParams {
  const next = new URLSearchParams(search);
  ['q', 'sort', 'page', ...config.filters.filter(validFilter).map((filter) => filter.key)]
    .forEach((key) => next.delete(key));
  return next;
}

export type DirectoryToolbarProps = DirectoryQueryConfig & {
  label: string;
  resultCount: number;
  locale?: 'en' | 'es';
  mobileFilters?: boolean;
  pageCount?: number;
};

/** One URL-backed toolbar for a collection; callers own filtering and result retrieval. */
export default function DirectoryToolbar({
  label, resultCount, filters, sortOptions, locale = 'en', mobileFilters = false,
  pageCount = undefined,
}: DirectoryToolbarProps) {
  const pathname = usePathname();
  const router = useRouter();
  const searchParams = useSearchParams();
  const config = { filters, sortOptions };
  const query = parseDirectoryQuery(searchParams.toString(), config);
  const searchId = useId();
  const es = locale === 'es';
  const pushQuery = (params: URLSearchParams) => {
    const encoded = params.toString();
    router.replace(encoded ? `${pathname}?${encoded}` : pathname, { scroll: false });
  };
  const submitSearch = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const q = new FormData(event.currentTarget).get('q');
    pushQuery(updateDirectoryQuery(searchParams.toString(), config, {
      q: typeof q === 'string' ? q : '',
    }));
  };
  const chips = [
    ...(query.q ? [{ key: 'q', label: `${es ? 'Buscar' : 'Search'}: ${query.q}` }] : []),
    ...filters.filter(validFilter).flatMap((filter) => {
      const value = query.filters[filter.key];
      const option = filter.options.find((candidate) => candidate.value === value);
      return option ? [{ key: filter.key, label: `${filter.label}: ${option.label}` }] : [];
    }),
  ];
  const filterFields = (
    <>
      {filters.filter(validFilter).map((filter) => (
        <label className={styles.field} key={filter.key}>
          <span>{filter.label}</span>
          <select
            value={query.filters[filter.key] ?? ''}
            onChange={(event) => pushQuery(updateDirectoryQuery(searchParams.toString(), config, {
              filters: { [filter.key]: event.target.value || null },
            }))}
          >
            <option value="">{es ? 'Todos' : 'All'}</option>
            {filter.options.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      ))}
      {sortOptions.length > 0 && (
        <label className={styles.field}>
          <span>{es ? 'Ordenar por' : 'Sort by'}</span>
          <select
            value={query.sort}
            onChange={(event) => pushQuery(updateDirectoryQuery(searchParams.toString(), config, {
              sort: event.target.value,
            }))}
          >
            <option value="">{es ? 'Predeterminado' : 'Default'}</option>
            {sortOptions.map((option) => (
              <option key={option.value} value={option.value}>{option.label}</option>
            ))}
          </select>
        </label>
      )}
    </>
  );
  return (
    <section className={styles.toolbar} aria-label={label}>
      <div className={styles.topRow}>
        <form className={styles.searchForm} role="search" onSubmit={submitSearch}>
          <label htmlFor={searchId}>{es ? 'Buscar' : 'Search'}</label>
          <div className={styles.searchControl}>
            <input
              id={searchId}
              key={query.q}
              name="q"
              type="search"
              defaultValue={query.q}
              maxLength={MAX_SEARCH_LENGTH}
            />
            <button type="submit">{es ? 'Buscar' : 'Search'}</button>
          </div>
        </form>
        <span className={styles.count} role="status" aria-live="polite">
          {es ? `${resultCount} resultados` : `${resultCount} results`}
        </span>
      </div>
      {mobileFilters ? (
        <details className={styles.mobileDisclosure}>
          <summary>{es ? 'Filtros y orden' : 'Filters and sort'}</summary>
          <div className={styles.fields}>{filterFields}</div>
        </details>
      ) : null}
      <div className={mobileFilters ? styles.desktopFields : styles.fields}>{filterFields}</div>
      {chips.length > 0 && (
        <div className={styles.chips} aria-label={es ? 'Filtros activos' : 'Active filters'}>
          {chips.map((chip) => (
            <button
              key={chip.key}
              type="button"
              className={styles.chip}
              aria-label={`${es ? 'Quitar' : 'Remove'} ${chip.label}`}
              onClick={() => {
                const patch = chip.key === 'q'
                  ? { q: '' } : { filters: { [chip.key]: null } };
                pushQuery(updateDirectoryQuery(searchParams.toString(), config, patch));
              }}
            >
              {chip.label}
              <span aria-hidden="true"> ×</span>
            </button>
          ))}
          <button
            type="button"
            className={styles.clear}
            onClick={() => {
              pushQuery(clearDirectoryQuery(searchParams.toString(), config));
            }}
          >
            {es ? 'Borrar todo' : 'Clear all'}
          </button>
        </div>
      )}
      {pageCount && pageCount > 1 && (
        <nav className={styles.pagination} aria-label={es ? 'Páginas de resultados' : 'Result pages'}>
          <button type="button" disabled={query.page <= 1} onClick={() => pushQuery(updateDirectoryQuery(searchParams.toString(), config, { page: query.page - 1 }))}>
            {es ? 'Anterior' : 'Previous'}
          </button>
          <span>{es ? `Página ${query.page} de ${pageCount}` : `Page ${query.page} of ${pageCount}`}</span>
          <button type="button" disabled={query.page >= pageCount} onClick={() => pushQuery(updateDirectoryQuery(searchParams.toString(), config, { page: query.page + 1 }))}>
            {es ? 'Siguiente' : 'Next'}
          </button>
        </nav>
      )}
    </section>
  );
}
