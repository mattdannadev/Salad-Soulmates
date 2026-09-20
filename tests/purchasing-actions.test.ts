import {
  beforeEach, expect, it, vi,
} from 'vitest';
import savePurchasing from '@/app/purchasing-actions';

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
  name: 'Plan',
  needed_on: '2026-10-01',
  batches: [{ recipe_version_id: id, batch_count: 4 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.permission.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
it('validates malformed input before touching the database', async () => {
  expect((await savePurchasing('save-plan', {})).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('requires supporting read permissions to prevent missing supply from becoming zero', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'inventory.read'));
  expect((await savePurchasing('save-plan', input)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('preserves request identity and invalidates purchasing and receiving after success', async () => {
  expect(await savePurchasing('save-plan', input)).toMatchObject({ ok: true, id });
  expect(mocks.rpc).toHaveBeenCalledWith('save_material_plan', { payload: input });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/receiving');
});
it('does not report SDK errors or malformed write acknowledgements as success', async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: '23505', message: 'Duplicate' },
  });
  expect((await savePurchasing('save-plan', input)).ok).toBe(false);
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
  expect((await savePurchasing('save-plan', input)).ok).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('handles lost connections with safe diagnostics and retry instructions', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Connection lost'));
  expect((await savePurchasing('save-plan', input)).message).toContain('Retry');
  expect(mocks.log).toHaveBeenCalled();
});
it('does not swallow authentication redirects', async () => {
  mocks.profile.mockRejectedValueOnce(new Error('REDIRECT:/login'));
  await expect(savePurchasing('save-plan', input)).rejects.toThrow('REDIRECT:/login');
});
