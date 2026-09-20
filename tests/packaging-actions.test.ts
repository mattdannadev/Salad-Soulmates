import {
  beforeEach, expect, it, vi,
} from 'vitest';
import savePackaging from '@/app/packaging-actions';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(), permission: vi.fn(), rpc: vi.fn(), revalidate: vi.fn(), log: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: mocks.profile }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));
const id = '00000000-0000-4000-8000-000000000001';
const input = {
  id, product_id: id, expected_version: 0, status: 'Draft', bag_size_gallons: 1, bags_per_case: 4, label_width_inches: 3, label_height_inches: 5, display_name: 'Dressing', ingredient_statement: '',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.permission.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
it.each([{ bag_size_gallons: 0 }, { bags_per_case: 1.5 }, { label_width_inches: 0 }, { label_height_inches: 13 }, { label_width_inches: 1.111 }, { status: 'Approved' }])('rejects invalid setup before authentication: %j', async (override) => {
  expect((await savePackaging({ ...input, ...override })).ok).toBe(false);
  expect(mocks.profile).not.toHaveBeenCalled();
});
it.each(['products.read', 'products.write'])('requires %s', async (denied) => {
  mocks.permission.mockImplementation(
    (_db: unknown, permission: string) => Promise.resolve(permission !== denied),
  );
  expect((await savePackaging(input)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('retains request identity, checks acknowledgments and invalidates dependent pages', async () => {
  expect(await savePackaging(input)).toMatchObject({ ok: true, id });
  expect(mocks.rpc).toHaveBeenCalledWith('save_packaging_profile', { payload: input });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/products');
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/orders');
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
  expect((await savePackaging(input)).ok).toBe(false);
});
it('surfaces safe conflicts and hides internal SDK errors', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Packaging setup changed; reload before trying again' } });
  expect((await savePackaging(input)).message).toContain('reload');
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private SQL data' } });
  expect((await savePackaging(input)).message).not.toContain('private');
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('handles connection failures without swallowing auth redirects', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Lost connection'));
  expect((await savePackaging(input)).message).toContain('Retry');
  mocks.profile.mockRejectedValueOnce(new Error('REDIRECT:/login'));
  await expect(savePackaging(input)).rejects.toThrow('REDIRECT:/login');
});
