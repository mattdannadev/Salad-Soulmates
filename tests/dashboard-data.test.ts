import {
  beforeEach, expect, it, vi,
} from 'vitest';
import loadDashboard from '@/lib/dashboard-data';

const mocks = vi.hoisted(() => ({
  context: vi.fn(), permission: vi.fn(), rows: vi.fn(), rpc: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.context }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/data', async (original) => ({ ...await original<typeof import('@/lib/data')>(), rows: mocks.rows }));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ db: { rpc: mocks.rpc }, profile: { preferred_locale: 'en' } });
  mocks.rpc.mockResolvedValue({ data: [], error: null });
  mocks.permission.mockResolvedValue(true);
  mocks.rows.mockResolvedValue([]);
});
it('does not load restricted panels or interpret denied inventory as zero', async () => {
  mocks.permission.mockResolvedValue(false);
  const dashboard = await loadDashboard();
  expect(dashboard.canOrders).toBe(false);
  expect(dashboard.canPurchases).toBe(false);
  expect(dashboard.canStock).toBe(false);
  expect(mocks.rows).not.toHaveBeenCalled();
});
it('requires order access to calculate supplier arrivals', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => permission !== 'orders.read');
  const dashboard = await loadDashboard();
  expect(dashboard.canPurchases).toBe(false);
  expect(mocks.rows).not.toHaveBeenCalledWith(expect.anything(), 'purchase_drafts', expect.anything());
});
it('surfaces failed reads instead of falsely reporting nothing outstanding', async () => {
  mocks.rows.mockRejectedValue(new Error('Database unavailable'));
  await expect(loadDashboard()).rejects.toThrow('Database unavailable');
});
it('prioritizes open-order ingredients and distinguishes unknown from zero owned stock', async () => {
  const records: Record<string, unknown[]> = {
    customer_orders: [{ id: 'open', needed_on: '2026-10-01' }, { id: 'cancelled', needed_on: '2026-09-01' }],
    material_plans: [
      { id: 'open', status: 'Active', requirements: [{ ingredient_id: 'b', required: 2 }] },
      { id: 'cancelled', status: 'Cancelled', requirements: [{ ingredient_id: 'a', required: 99 }] },
    ],
    ingredients: [
      { id: 'a', name: 'A', active: true }, { id: 'b', name: 'B', active: true },
      { id: 'c', name: 'C', active: false },
    ],
    inventory_events: [
      { ingredient_id: 'b', quantity_delta: 10 }, { ingredient_id: 'b', quantity_delta: -10 },
    ],
  };
  mocks.rows.mockImplementation((_db: unknown, table: string) => records[table] ?? []);
  const dashboard = await loadDashboard();
  expect(dashboard.openOrders.map((order) => order.id)).toEqual(['open']);
  expect(dashboard.stock.map((ingredient) => [
    ingredient.id, ingredient.balance, ingredient.demand,
  ]))
    .toEqual([['b', 0, 2], ['a', null, 0]]);
});
