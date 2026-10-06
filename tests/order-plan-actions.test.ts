import {
  beforeEach, expect, it, vi,
} from 'vitest';
import orderPlanAction from '@/app/order-plan-actions';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), log: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: mocks.profile }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
const orderId = '00000000-0000-4000-8000-000000000001';

beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.permission.mockResolvedValue(true);
});

it('requires reviewed fingerprint and explicit reference before destructive persistence', async () => {
  expect((await orderPlanAction('delete-order', { order_id: orderId })).ok).toBe(false);
  expect((await orderPlanAction('delete-order', { order_id: orderId, fingerprint: 'reviewed' })).ok).toBe(false);
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('loads deletion counts without performing a mutation or invalidating the planner', async () => {
  const preview = {
    order_id: orderId, reference: 'PO-123', fingerprint: 'reviewed', can_delete: true, counts: [{ table_name: 'order_mixer_batches', count: 3 }], warnings: [],
  };
  mocks.rpc.mockResolvedValue({ data: preview, error: null });
  expect(await orderPlanAction('preview-delete', { order_id: orderId })).toMatchObject({ ok: true, kind: 'delete-preview', data: preview });
  expect(mocks.rpc).toHaveBeenCalledWith('preview_delete_customer_order', { payload: { order_id: orderId } });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it('requires inventory adjustment and purchasing permissions for deleting an order', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'inventory.adjust'));
  expect((await orderPlanAction('delete-order', { order_id: orderId, fingerprint: 'reviewed', confirmation: 'PO-123' })).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});

it('preserves reviewed payload and invalidates dependent screens after deletion', async () => {
  const payload = { order_id: orderId, fingerprint: 'reviewed', confirmation: 'PO-123' };
  mocks.rpc.mockResolvedValue({
    data: { order_id: orderId, deleted: true, deleted_records: 20 }, error: null,
  });
  expect(await orderPlanAction('delete-order', payload)).toMatchObject({ ok: true, kind: 'saved' });
  expect(mocks.rpc).toHaveBeenCalledWith('delete_customer_order', { payload });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/scheduling');
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/orders');
});

it('rejects stale proposals and mismatched confirmations without claiming success', async () => {
  mocks.rpc.mockResolvedValue({ data: null, error: { message: 'Order records changed; review deletion again' } });
  expect(await orderPlanAction('delete-order', { order_id: orderId, fingerprint: 'stale', confirmation: 'PO-123' })).toEqual({ ok: false, message: 'Order records changed; review deletion again' });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it('explains when the order-planning database migration is unavailable', async () => {
  mocks.rpc.mockResolvedValue({
    data: null,
    error: { code: 'PGRST202', message: 'Could not find the function public.preview_order_production_work' },
  });
  await expect(orderPlanAction('preview-production', { order_id: orderId })).resolves.toEqual({
    ok: false,
    message: 'Production planning is not available yet because its database update has not been applied.',
  });
});

it('shows a production proposal without creating any work', async () => {
  const proposal = {
    order_id: orderId,
    reference: 'PO-123',
    pickup_on: '2026-10-15',
    start_on: '2026-10-11',
    finish_on: '2026-10-13',
    timezone: 'America/Chicago',
    fingerprint: 'proposal',
    can_confirm: true,
    existing_plan: false,
    total_batches: 3,
    events: [],
    warnings: [],
  };
  mocks.rpc.mockResolvedValue({ data: proposal, error: null });
  expect(await orderPlanAction('preview-production', { order_id: orderId }))
    .toMatchObject({ ok: true, kind: 'proposal', data: proposal });
  expect(mocks.rpc).toHaveBeenCalledTimes(1);
  expect(mocks.rpc).toHaveBeenCalledWith('preview_order_production_work', {
    payload: { order_id: orderId },
  });
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it('creates production only with the reviewed proposal and rejects incorrect acknowledgments', async () => {
  expect((await orderPlanAction('create-production', { order_id: orderId })).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.rpc.mockResolvedValue({
    data: {
      order_id: '00000000-0000-4000-8000-000000000002', created: true, event_count: 3, batch_count: 3,
    },
    error: null,
  });
  expect((await orderPlanAction('create-production', { order_id: orderId, fingerprint: 'reviewed' })).ok).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});

it('preserves the reviewed production adjustments when creating work', async () => {
  const payload = {
    order_id: orderId,
    fingerprint: 'adjusted-proposal',
    production_start_on: '2026-10-12',
    product_days: [{ product_id: '00000000-0000-4000-8000-000000000002', workdays: 3 }],
  };
  mocks.rpc.mockResolvedValue({
    data: {
      order_id: orderId, created: true, event_count: 5, batch_count: 6,
    },
    error: null,
  });
  expect(await orderPlanAction('create-production', payload)).toMatchObject({ ok: true, kind: 'saved' });
  expect(mocks.rpc).toHaveBeenCalledWith('create_order_production_work', { payload });
});

it('rejects invalid production adjustments before contacting the database', async () => {
  const invalidAdjustments = [
    { production_start_on: '2026-02-30' },
    { product_days: [{ product_id: orderId, workdays: 0 }] },
    { product_days: [{ product_id: orderId, workdays: 1.5 }] },
    { product_days: [{ product_id: orderId, workdays: 91 }] },
  ];
  await Promise.all(invalidAdjustments.map(async (input) => {
    expect((await orderPlanAction('preview-production', { order_id: orderId, ...input })).ok).toBe(false);
  }));
  expect(mocks.profile).not.toHaveBeenCalled();
  expect(mocks.rpc).not.toHaveBeenCalled();
});
