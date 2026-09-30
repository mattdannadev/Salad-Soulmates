import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { appendSupplierPrice } from '@/features/supplier-pricing/service';
import { SupplierPricingDataError } from '@/features/supplier-pricing/data';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  permission: vi.fn(),
  find: vi.fn(),
  insert: vi.fn(),
  load: vi.fn(),
  log: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({
  requireAdminShell: mocks.profile,
  requireProfile: mocks.profile,
}));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('@/features/supplier-pricing/data', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/features/supplier-pricing/data')>();
  return {
    ...original,
    findSupplierItem: mocks.find,
    insertSupplierPrice: mocks.insert,
    loadSupplierPricingData: mocks.load,
  };
});

const itemId = '00000000-0000-4000-8000-000000000001';
const priceId = '00000000-0000-4000-8000-000000000002';
const input = {
  supplier_item_id: itemId,
  unit_price: 14.25,
  effective_on: '2026-09-30',
  note: 'New quote',
};

describe('supplier pricing service', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.mockResolvedValue({ db: {} });
    mocks.permission.mockResolvedValue(true);
    mocks.find.mockResolvedValue({
      id: itemId,
      active: true,
      ingredients: { active: true },
      suppliers: { active: true },
    });
    mocks.insert.mockResolvedValue(priceId);
  });

  it('requires read and write permissions before inserting', async () => {
    mocks.permission.mockImplementation(
      (_db: unknown, permission: string) => Promise.resolve(permission !== 'master_data.write'),
    );
    await expect(appendSupplierPrice(input)).resolves.toMatchObject({ ok: false });
    expect(mocks.find).not.toHaveBeenCalled();
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('appends an active supplier item price and returns its identity', async () => {
    const result = await appendSupplierPrice(input);
    expect(result).toMatchObject({
      ok: true,
      id: priceId,
    });
    expect(result.message).toContain('Previous prices remain');
    expect(mocks.insert).toHaveBeenCalledWith(expect.anything(), input);
  });

  it.each([
    {
      label: 'supplier item',
      item: { active: false, ingredients: { active: true }, suppliers: { active: true } },
    },
    {
      label: 'ingredient',
      item: { active: true, ingredients: { active: false }, suppliers: { active: true } },
    },
    {
      label: 'supplier',
      item: { active: true, ingredients: { active: true }, suppliers: { active: false } },
    },
  ])('rejects an inactive linked $label', async ({ item }) => {
    mocks.find.mockResolvedValueOnce({ id: itemId, ...item });
    const result = await appendSupplierPrice(input);
    expect(result.ok).toBe(false);
    expect(result.message).toContain('Reactivate');
    expect(mocks.insert).not.toHaveBeenCalled();
  });

  it('maps duplicate effective dates to a safe actionable error', async () => {
    mocks.insert.mockRejectedValueOnce(new SupplierPricingDataError('23505', new Error('private')));
    const duplicateResult = await appendSupplierPrice(input);
    expect(duplicateResult.ok).toBe(false);
    expect(duplicateResult.message).toContain('already exists');
  });

  it('does not swallow authentication redirects', async () => {
    mocks.profile.mockRejectedValueOnce(new Error('REDIRECT:/login'));
    await expect(appendSupplierPrice(input)).rejects.toThrow('REDIRECT:/login');
  });
});
