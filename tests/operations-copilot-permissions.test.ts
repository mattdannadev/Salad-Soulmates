import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import queryOperations from '@/services/operations-copilot';

const mocks = vi.hoisted(() => ({
  resolveAccess: vi.fn(),
  begin: vi.fn(),
  finish: vi.fn(),
  recipes: vi.fn(),
  orders: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ resolveApiAdminShell: mocks.resolveAccess }));
vi.mock('@/data/operations-copilot', () => ({
  beginCopilotRequest: mocks.begin,
  finishCopilotRequest: mocks.finish,
  readCopilotRecipes: mocks.recipes,
  readCopilotOrders: mocks.orders,
}));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.resolveAccess.mockResolvedValue({
    ok: true,
    db: {},
    profile: { role: 'admin', organization_id: 'org', facility_id: 'facility' },
  });
  mocks.begin.mockResolvedValue('accepted');
  mocks.finish.mockResolvedValue(undefined);
  mocks.recipes.mockResolvedValue([]);
  mocks.orders.mockResolvedValue([]);
});

describe('Operations Copilot administrator boundary', () => {
  it('rejects unsupported intents and client-owned scope before authentication', async () => {
    await expect(queryOperations({ kind: 'inventory' })).resolves.toMatchObject({ code: 'unsupported' });
    await expect(queryOperations({ kind: 'orders', facility_id: 'other' }))
      .resolves.toMatchObject({ code: 'invalid' });
    expect(mocks.resolveAccess).not.toHaveBeenCalled();
  });

  it('denies reviewer role after the audit gate and before reading', async () => {
    mocks.begin.mockResolvedValueOnce('denied');
    mocks.resolveAccess.mockResolvedValueOnce({
      ok: true, db: {}, profile: { role: 'reviewer' },
    });
    await expect(queryOperations({ kind: 'recipes' })).resolves.toMatchObject({ code: 'denied' });
    expect(mocks.begin).toHaveBeenCalledOnce();
    expect(mocks.recipes).not.toHaveBeenCalled();
  });

  it('does not read when the durable gate denies or rate limits', async () => {
    mocks.begin.mockResolvedValueOnce('denied').mockResolvedValueOnce('rate_limited');
    await expect(queryOperations({ kind: 'recipes' })).resolves.toMatchObject({ code: 'denied' });
    await expect(queryOperations({ kind: 'orders' })).resolves.toMatchObject({ code: 'rate_limited' });
    expect(mocks.recipes).not.toHaveBeenCalled();
    expect(mocks.orders).not.toHaveBeenCalled();
  });

  it('scopes reads with server profile IDs and records completion', async () => {
    await expect(queryOperations({ kind: 'orders', search: 'Grocery' }))
      .resolves.toMatchObject({ ok: true, kind: 'orders', count: 0 });
    expect(mocks.orders).toHaveBeenCalledWith({}, 'org', 'facility', 'Grocery', 10, expect.any(AbortSignal));
    expect(mocks.finish).toHaveBeenCalledWith({}, expect.any(String), 'completed', expect.any(AbortSignal));
  });

  it('fails the read and audits a bounded response violation', async () => {
    mocks.recipes.mockResolvedValueOnce(Array.from({ length: 26 }, (_, index) => ({ id: index })));
    await expect(queryOperations({ kind: 'recipes' })).rejects.toThrow('limits');
    expect(mocks.finish).toHaveBeenCalledWith({}, expect.any(String), 'failed', expect.any(AbortSignal));
  });

  it('rejects malformed read output and records failure', async () => {
    mocks.recipes.mockResolvedValueOnce([{
      id: 'bad-id',
      name: 'Recipe',
      active_version_id: null,
      url: '/app/recipes/bad-id',
    }]);
    await expect(queryOperations({ kind: 'recipes' })).rejects.toThrow();
    expect(mocks.finish).toHaveBeenCalledWith({}, expect.any(String), 'failed', expect.any(AbortSignal));
  });
});
