import { describe, expect, it } from 'vitest';
import type { LoginHistoryEntry } from '@/components/login-history-table';
import {
  hasLoginHistoryCriteria, parseLoginHistoryQuery, selectLoginHistory,
} from '@/app/app/user-management/login-history/directory-query';

const a = '00000000-0000-4000-8000-000000000001';
const b = '00000000-0000-4000-8000-000000000002';
const entries: LoginHistoryEntry[] = [
  {
    id: '2', userId: a, userName: 'Zoe', eventType: 'signed_in', occurredAt: '2026-09-21T23:59:00Z', source: 'Web',
  },
  {
    id: '1', userId: b, userName: 'Ana', eventType: 'signed_out', occurredAt: '2026-09-21T00:00:00Z', source: 'Mobile',
  },
  {
    id: '3', userId: b, userName: 'Ana', eventType: 'signed_in', occurredAt: '2026-09-22T00:00:00Z', source: 'Web',
  },
];

describe('Login History directory query', () => {
  it('accepts single valid criteria and ignores malformed, repeated, and impossible dates', () => {
    expect(parseLoginHistoryQuery({
      q: '  Ana  ',
      user: b,
      event: 'signed_out',
      from: '2026-09-21',
      to: '2026-09-22',
      sort: 'oldest',
    })).toEqual({
      q: 'Ana', user: b, event: 'signed_out', from: '2026-09-21', to: '2026-09-22', sort: 'oldest',
    });
    expect(parseLoginHistoryQuery({
      q: ['Ana', 'Zoe'],
      user: 'bad',
      event: ['signed_in', 'signed_out'],
      from: '2026-02-30',
      to: '2026-13-01',
      sort: 'unknown',
    })).toEqual({
      q: '', user: undefined, event: undefined, from: undefined, to: undefined, sort: 'newest',
    });
  });

  it('filters by user, event, search and inclusive UTC dates', () => {
    const query = parseLoginHistoryQuery({
      user: b, event: 'signed_out', q: 'mobile', from: '2026-09-21', to: '2026-09-21',
    });
    expect(selectLoginHistory(entries, query, 'en').map((entry) => entry.id)).toEqual(['1']);
    expect(selectLoginHistory(entries, parseLoginHistoryQuery({ q: 'sesión iniciada' }), 'es')
      .map((entry) => entry.id)).toEqual(['3', '2']);
  });

  it('sorts deterministically and exposes active criteria', () => {
    expect(selectLoginHistory(entries, parseLoginHistoryQuery({}), 'en').map((entry) => entry.id))
      .toEqual(['3', '2', '1']);
    expect(selectLoginHistory(entries, parseLoginHistoryQuery({ sort: 'oldest' }), 'en')
      .map((entry) => entry.id)).toEqual(['1', '2', '3']);
    expect(selectLoginHistory(entries, parseLoginHistoryQuery({ sort: 'user' }), 'en')
      .map((entry) => entry.id)).toEqual(['3', '1', '2']);
    expect(hasLoginHistoryCriteria(parseLoginHistoryQuery({}))).toBe(false);
    expect(hasLoginHistoryCriteria(parseLoginHistoryQuery({ from: '2026-09-21' }))).toBe(true);
  });
});
