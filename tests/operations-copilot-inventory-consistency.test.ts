import {
  describe, expect, it, vi,
} from 'vitest';
import queryOperations from '@/services/operations-copilot';

const mocks = vi.hoisted(() => ({ resolveAccess: vi.fn() }));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ resolveApiAdminShell: mocks.resolveAccess }));

describe('deferred inventory intent', () => {
  it('rejects inventory before authentication or a database read', async () => {
    await expect(queryOperations({ kind: 'inventory' })).resolves.toMatchObject({
      ok: false, code: 'unsupported',
    });
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
  });
});
