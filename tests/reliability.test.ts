import {
  describe, expect, it, vi,
} from 'vitest';
import { formatDate, facilityDate } from '../src/domain/format';
import inventoryBalances from '../src/domain/inventory';
import { persistSessionCookies, READ_ONLY_COOKIE_ERROR } from '../src/lib/session-cookies';

describe('dates, quantities, and session persistence', () => {
  it('keeps a SQL date on the recorded calendar day', () => {
    expect(formatDate('2026-09-19')).toBe('Sep 19, 2026');
    expect(formatDate('2026-01-01')).toBe('Jan 1, 2026');
  });
  it('evaluates the receipt default in Houston across midnight and DST', () => {
    expect(facilityDate(new Date('2026-09-19T02:00:00Z'))).toBe('2026-09-18');
    expect(facilityDate(new Date('2026-01-01T05:30:00Z'))).toBe('2025-12-31');
  });
  it('rejects invalid dates and corrupt inventory totals', () => {
    expect(() => formatDate('bad date')).toThrow();
    expect(() => inventoryBalances([{ ingredient_id: 'a', quantity_delta: 'NaN' }])).toThrow();
    expect(() => inventoryBalances([{ ingredient_id: 'a', quantity_delta: Infinity }])).toThrow();
    expect(() => inventoryBalances([{ ingredient_id: 'a', quantity_delta: 0.00001 }])).toThrow();
    expect(() => inventoryBalances([{ ingredient_id: 'a', quantity_delta: Number.MAX_SAFE_INTEGER }])).toThrow();
  });
  it('handles inherited property names as ordinary ingredient keys', () => {
    expect(inventoryBalances([{ ingredient_id: '__proto__', quantity_delta: 1 }])).toEqual({
      ['__proto__']: 1,
    });
  });
  const values = [{ name: 'session', value: 'private', options: {} }];
  it('persists cookies in write contexts', () => {
    const write = vi.fn();
    persistSessionCookies(values, write, false);
    expect(write).toHaveBeenCalledWith('session', 'private', {});
  });
  it('defers only the exact known read-only error during component reads', () => {
    const write = () => {
      throw new Error(READ_ONLY_COOKIE_ERROR);
    };
    expect(() => persistSessionCookies(values, write, true)).not.toThrow();
    expect(() => persistSessionCookies(values, write, false)).toThrow('Unable to persist');
  });
  it('preserves unexpected write failures as causes', () => {
    const cause = new Error('unexpected');
    try {
      persistSessionCookies(
        values,
        () => {
          throw cause;
        },
        true,
      );
    } catch (error) {
      expect(error).toHaveProperty('cause', cause);
      return;
    }
    throw new Error('Expected cookie persistence to fail.');
  });
});
