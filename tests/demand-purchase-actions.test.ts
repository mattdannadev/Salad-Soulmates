import {
  beforeEach, expect, it, vi,
} from 'vitest';
import generateDemandPurchases from '@/app/demand-purchase-actions';

const mocks = vi.hoisted(() => ({
  auth: vi.fn(), permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), log: vi.fn(),
}));
vi.mock('@/lib/auth', () => ({ requireProfile: mocks.auth }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
const id = '00000000-0000-4000-8000-000000000001';
beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.permission.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: { created: [id], skipped: [] }, error: null });
});
it('only submits a validated request ID and invalidates affected screens on acknowledged success', async () => {
  expect(await generateDemandPurchases(id)).toEqual({
    ok: true, result: { created: [id], skipped: [] },
  });
  expect(mocks.rpc).toHaveBeenCalledWith('generate_demand_purchases', { request_id: id });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app');
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/purchasing');
});
it('rejects bad IDs and missing permissions without writing', async () => {
  expect((await generateDemandPurchases({ id })).ok).toBe(false);
  mocks.permission.mockResolvedValue(false);
  expect((await generateDemandPurchases(id)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('keeps retries safe after SDK, transport and malformed-response failures', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { code: 'FAILED' } });
  expect((await generateDemandPurchases(id)).ok).toBe(false);
  mocks.rpc.mockRejectedValueOnce(new Error('Connection interrupted'));
  expect((await generateDemandPurchases(id)).ok).toBe(false);
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
  expect((await generateDemandPurchases(id)).ok).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
  expect(mocks.log).toHaveBeenCalledTimes(3);
});
it('does not swallow authentication redirects', async () => {
  mocks.auth.mockRejectedValue(new Error('REDIRECT'));
  await expect(generateDemandPurchases(id)).rejects.toThrow('REDIRECT');
});
