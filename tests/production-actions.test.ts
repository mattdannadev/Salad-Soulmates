import {
  beforeEach, expect, it, vi,
} from 'vitest';
import saveProduction, { assignProductionLot } from '@/app/production-actions';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  permission: vi.fn(),
  rpc: vi.fn(),
  revalidate: vi.fn(),
  log: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: mocks.profile }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
const id = '00000000-0000-4000-8000-000000000001';
const input = {
  id,
  revision: 0,
  start_on: '2026-09-28',
  finish_on: '2026-09-30',
  status: 'Draft',
  note: '',
  shortage_reason: '',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.permission.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});

it('rejects malformed dates before authentication or persistence', async () => {
  expect((await saveProduction({ ...input, start_on: '2026-10-02' })).ok).toBe(false);
  expect((await saveProduction({ ...input, start_on: '2026-02-30' })).ok).toBe(false);
  expect(mocks.profile).not.toHaveBeenCalled();
});
it('requires all order, planning and inventory permissions', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'orders.write'));
  expect((await saveProduction(input)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('keeps revision and identity stable and invalidates affected routes', async () => {
  expect(await saveProduction(input)).toMatchObject({ ok: true, id });
  expect(mocks.rpc).toHaveBeenCalledWith('save_order_production_plan', { payload: input });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/orders');
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/purchasing');
});
it('surfaces safe conflicts and does not return success for SDK errors', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Production plan changed; reload before trying again' } });
  expect(await saveProduction(input)).toMatchObject({ ok: false, message: 'Production plan changed; reload before trying again' });
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private internal details' } });
  expect((await saveProduction(input)).message).not.toContain('private internal');
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('preserves retryability on lost responses and invalid acknowledgments', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Lost response'));
  expect((await saveProduction(input)).message).toContain('Retry');
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
  expect((await saveProduction(input)).ok).toBe(false);
  expect(mocks.log).toHaveBeenCalledTimes(2);
});
it('keeps authentication redirects outside mutation error handling', async () => {
  mocks.profile.mockRejectedValueOnce(new Error('REDIRECT:/login'));
  await expect(saveProduction(input)).rejects.toThrow('REDIRECT:/login');
});
it('assigns a validated facility-local production lot through its RPC', async () => {
  const result = await assignProductionLot({ order_id: id, product_id: id, assigned_on: '2026-09-18' });
  expect(result).toMatchObject({ ok: true, id });
  expect(mocks.rpc).toHaveBeenCalledWith('assign_production_lot', {
    payload: { order_id: id, product_id: id, assigned_on: '2026-09-18' },
  });
});
