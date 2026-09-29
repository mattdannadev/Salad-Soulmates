import { z } from 'zod';
import type { LoginHistoryEntry } from '@/components/login-history-table';

export type LoginHistorySearchParams = Record<string, string | string[] | undefined>;

export interface LoginHistoryQuery {
  q: string;
  user?: string;
  event?: LoginHistoryEntry['eventType'];
  from?: string;
  to?: string;
  sort: 'newest' | 'oldest' | 'user';
}

function singleValue(params: LoginHistorySearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

function validDate(value: string | undefined): string | undefined {
  if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return undefined;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value
    ? value : undefined;
}

/** Ignore malformed or repeated URL values while preserving valid independent criteria. */
export function parseLoginHistoryQuery(params: LoginHistorySearchParams): LoginHistoryQuery {
  const q = z.string().trim().max(200).catch('')
    .parse(singleValue(params, 'q'));
  const user = z.uuid().optional().catch(undefined).parse(singleValue(params, 'user'));
  const event = z.enum(['signed_in', 'signed_out']).optional().catch(undefined)
    .parse(singleValue(params, 'event'));
  const sort = z.enum(['newest', 'oldest', 'user']).catch('newest')
    .parse(singleValue(params, 'sort'));
  return {
    q,
    user,
    event,
    from: validDate(singleValue(params, 'from')),
    to: validDate(singleValue(params, 'to')),
    sort,
  };
}

export function hasLoginHistoryCriteria(query: LoginHistoryQuery): boolean {
  return Boolean(query.q || query.user || query.event || query.from || query.to || query.sort !== 'newest');
}

/** Search the bounded audit result without changing its authorization or database scope. */
export function selectLoginHistory(
  entries: readonly LoginHistoryEntry[],
  query: LoginHistoryQuery,
  locale: 'en' | 'es',
): LoginHistoryEntry[] {
  const needle = query.q.toLocaleLowerCase(locale);
  const filtered = entries.filter((entry) => {
    if (query.user && entry.userId !== query.user) return false;
    if (query.event && entry.eventType !== query.event) return false;
    const date = new Date(entry.occurredAt).toISOString().slice(0, 10);
    if (query.from && date < query.from) return false;
    if (query.to && date > query.to) return false;
    if (!needle) return true;
    let outcome = locale === 'es' ? 'sesión iniciada' : 'signed in';
    if (entry.eventType === 'signed_out') {
      outcome = locale === 'es' ? 'sesión cerrada' : 'signed out';
    }
    return [entry.userName, entry.source, outcome]
      .some((value) => value.toLocaleLowerCase(locale).includes(needle));
  });
  return filtered.sort((left, right) => {
    if (query.sort === 'user') {
      const names = left.userName.localeCompare(right.userName, locale, { sensitivity: 'base' });
      if (names) return names;
    }
    const dates = left.occurredAt.localeCompare(right.occurredAt);
    if (dates) return query.sort === 'oldest' ? dates : -dates;
    return left.id.localeCompare(right.id);
  });
}
