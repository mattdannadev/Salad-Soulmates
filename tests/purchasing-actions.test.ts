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
  customer_name: 'Synthetic customer',
  reference: '',
  needed_on: '2026-10-01',
  products: [{ product_id: id, batch_count: 4, customer_product_option_id: null }],
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.profile.mockResolvedValue({ db: { rpc: mocks.rpc } });
  mocks.permission.mockResolvedValue(true);
  mocks.rpc.mockResolvedValue({ data: id, error: null });
});
it('validates malformed input before touching the database', async () => {
  expect((await savePurchasing('save-order', {})).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('requires supporting read permissions to prevent missing supply from becoming zero', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'inventory.read'));
  expect((await savePurchasing('save-order', input)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('preserves request identity and invalidates purchasing and receiving after success', async () => {
  expect(await savePurchasing('save-order', input)).toMatchObject({ ok: true, id });
  expect(mocks.rpc).toHaveBeenCalledWith('save_customer_order', { payload: input });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/receiving');
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/suppliers');
});
it('soft-deactivates an order through the cancellation RPC', async () => {
  expect(await savePurchasing('cancel-order', { id })).toMatchObject({
    ok: true,
    id,
    message: 'Order deactivated.',
  });
  expect(mocks.rpc).toHaveBeenCalledWith('cancel_customer_order', { order_id: id });
});
it('does not report SDK errors or malformed write acknowledgements as success', async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: '23505', message: 'Duplicate' },
  });
  expect((await savePurchasing('save-order', input)).ok).toBe(false);
  mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
  expect((await savePurchasing('save-order', input)).ok).toBe(false);
  expect(mocks.revalidate).not.toHaveBeenCalled();
});
it('identifies an outdated database that still requires a standalone purchase reason', async () => {
  mocks.rpc.mockResolvedValueOnce({
    data: null,
    error: { code: 'P0001', message: 'A standalone purchase requires a reason' },
  });
  const purchase = {
    id,
    kind: 'standalone' as const,
    supplier_id: id,
    expected_on: '2026-10-01',
    lines: [{
      ingredient_id: id,
      supplier_item_id: id,
      purchase_units: 1,
      override_reason: '',
    }],
  };
  await expect(savePurchasing('create-draft', purchase)).resolves.toMatchObject({
    ok: false,
    message: 'The purchase database needs the optional-reason update. Contact an administrator.',
  });
});
it('handles lost connections with safe diagnostics and retry instructions', async () => {
  mocks.rpc.mockRejectedValueOnce(new Error('Connection lost'));
  expect((await savePurchasing('save-order', input)).message).toContain('Retry');
  expect(mocks.log).toHaveBeenCalled();
});
it('does not swallow authentication redirects', async () => {
  mocks.profile.mockRejectedValueOnce(new Error('REDIRECT:/login'));
  await expect(savePurchasing('save-order', input)).rejects.toThrow('REDIRECT:/login');
});

it('requires order-write permission and rejects the removed standalone creation action', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'orders.write'));
  expect((await savePurchasing('save-order', input)).ok).toBe(false);
  expect((await savePurchasing('save-plan', input)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
});
it('validates customer prices and requires product-write permission', async () => {
  const option = {
    id,
    revision: 0,
    product_id: id,
    customer_name: 'Customer',
    label: 'Bag',
    packaging_mode: 'custom',
    unit_name: 'bag',
    gallons_per_unit: 2,
    unit_price: 12.5,
    currency: 'USD',
    active: true,
    is_preferred: true,
  };
  expect((await savePurchasing('save-option', { ...option, unit_price: 1.001 })).ok).toBe(false);
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'products.write'));
  expect((await savePurchasing('save-option', option)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.permission.mockResolvedValue(true);
  expect((await savePurchasing('save-option', option)).ok).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith('save_customer_product_option', { payload: option });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/products');
});

it('validates customer contacts, requires order permission, and invalidates the directory', async () => {
  const customer = { id, name: 'Customer', email: 'contact@example.test' };
  expect((await savePurchasing('save-customer', { ...customer, email: 'invalid' })).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
  mocks.permission.mockResolvedValueOnce(false);
  expect((await savePurchasing('save-customer', customer)).ok).toBe(false);
  expect(mocks.rpc).not.toHaveBeenCalled();
  expect((await savePurchasing('save-customer', customer)).ok).toBe(true);
  expect(mocks.rpc).toHaveBeenCalledWith('save_customer_master', {
    payload: {
      ...customer, revision: 0, contact_name: '', phone: '', address: '', notes: '',
    },
  });
  expect(mocks.revalidate).toHaveBeenCalledWith('/app/customers');
  expect(mocks.revalidate).toHaveBeenCalledWith('/app');
});
