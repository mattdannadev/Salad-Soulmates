import {
  describe, expect, it, vi,
} from 'vitest';
import { z } from 'zod';
import { readResult } from '../src/lib/data';

vi.mock('server-only', () => ({}));
const schema = z.array(z.object({ id: z.uuid() }));
describe('persisted data trust boundary', () => {
  it('distinguishes empty records from an unavailable data service', () => {
    expect(readResult({ data: [], error: null }, schema, 'test_read')).toEqual([]);
    const cause = { code: 'CONNECTION_FAILED', message: 'private database detail' };
    expect(() => readResult({ data: [], error: cause }, schema, 'test_read')).toThrow(
      'Unable to load the requested records.',
    );
  });
  it('rejects malformed persisted records instead of rendering trusted casts', () => {
    expect(() => readResult({ data: [{ id: 'invalid' }], error: null }, schema, 'test_read')).toThrow();
  });
});
