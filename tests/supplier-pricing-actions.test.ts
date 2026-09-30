import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import {
  addSupplierPrice,
  initialSupplierPriceActionState,
} from '@/features/supplier-pricing/actions';

const mocks = vi.hoisted(() => ({ append: vi.fn(), revalidate: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/features/supplier-pricing/service', () => ({
  appendSupplierPrice: mocks.append,
}));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const itemId = '00000000-0000-4000-8000-000000000001';

function form(overrides: Record<string, string> = {}): FormData {
  const values = {
    supplier_item_id: itemId,
    unit_price: '12.50',
    effective_on: '2026-09-30',
    note: 'Quote 101',
    ...overrides,
  };
  const data = new FormData();
  Object.entries(values).forEach(([key, value]) => data.set(key, value));
  return data;
}

describe('supplier pricing action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.append.mockResolvedValue({ ok: true, id: itemId, message: 'Saved.' });
  });

  it('validates untrusted form input before invoking the service', async () => {
    const result = await addSupplierPrice(
      initialSupplierPriceActionState,
      form({ unit_price: '12.555' }),
    );
    expect(result.ok).toBe(false);
    expect(mocks.append).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it('normalizes input, appends the price, and refreshes affected workspaces', async () => {
    const result = await addSupplierPrice(initialSupplierPriceActionState, form());
    expect(result).toMatchObject({ ok: true, submittedItemId: itemId });
    expect(mocks.append).toHaveBeenCalledWith({
      supplier_item_id: itemId,
      unit_price: 12.5,
      effective_on: '2026-09-30',
      note: 'Quote 101',
    });
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/pricing');
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/suppliers');
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/ingredients');
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/purchasing');
  });

  it('preserves service errors and does not invalidate stale views', async () => {
    mocks.append.mockResolvedValueOnce({ ok: false, message: 'Choose another date.' });
    await expect(addSupplierPrice(initialSupplierPriceActionState, form())).resolves
      .toMatchObject({ ok: false, submittedItemId: itemId });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
