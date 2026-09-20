import {
  beforeEach, expect, it, vi,
} from 'vitest';
import saveShippingDraft from '@/app/shipping-actions';
import { shippingDraftInputSchema } from '@/domain/shipping';

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
  id, order_id: id, planned_on: '2026-10-01', method: 'Pickup', note: '', lines: [{ product_id: id, quantity: 5 }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.permission.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
it.each([
  { ...input, planned_on: '2026-02-30' },
  { ...input, status: 'Confirmed' },
  { ...input, method: 'Delivered' },
  { ...input, lines: [] },
  { ...input, lines: [...input.lines, ...input.lines] },
  { ...input, lines: [{ product_id: id, quantity: 0.5 }] },
])('rejects invalid draft before authentication', async (invalid) => {
  expect(shippingDraftInputSchema.safeParse(invalid).success).toBe(false);
  expect((await saveShippingDraft(invalid)).ok).toBe(false);
  expect(mocks.profile).not.toHaveBeenCalled();
});
it.each(['orders.read', 'orders.write', 'planning.read', 'planning.write'])('requires %s', async (denied) => {
  mocks.permission.mockImplementation(
    (_db: unknown, permission: string) => Promise.resolve(permission !== denied),
  );
  expect((await saveShippingDraft(input)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('retains request identity and invalidates shipping after success', async () => {
  expect(await saveShippingDraft(input)).toMatchObject({ ok: true, id });
  expect(mocks.rpc).toHaveBeenCalledWith('save_shipping_draft', { payload: input });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/shipping');
});
it('reports safe business errors, hides internal details and permits lost-response retries', async () => {
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'Draft quantity exceeds ordered quantity' } });
  expect((await saveShippingDraft(input)).message).toBe('Draft quantity exceeds ordered quantity');
  mocks.rpc.mockResolvedValueOnce({ data: null, error: { message: 'private database details' } });
  expect((await saveShippingDraft(input)).message).not.toContain('private');
  mocks.rpc.mockRejectedValueOnce(new Error('Lost response'));
  expect((await saveShippingDraft(input)).ok).toBe(false);
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
  expect((await saveShippingDraft(input)).ok).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('preserves authentication redirects', async () => {
  mocks.profile.mockRejectedValueOnce(new Error('REDIRECT:/login'));
  await expect(saveShippingDraft(input)).rejects.toThrow('REDIRECT:/login');
});
