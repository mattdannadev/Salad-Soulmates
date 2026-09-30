import { describe, expect, it } from 'vitest';
import {
  buildSupplierPricingItems,
  supplierPriceInputSchema,
  type SupplierPrice,
  type SupplierPricingSource,
} from '@/features/supplier-pricing/domain';

const itemId = '00000000-0000-4000-8000-000000000001';
const ingredientId = '00000000-0000-4000-8000-000000000002';
const supplierId = '00000000-0000-4000-8000-000000000003';

function price(id: string, effectiveOn: string, unitPrice: number): SupplierPrice {
  return {
    id,
    supplier_item_id: itemId,
    unit_price: unitPrice,
    currency: 'USD',
    effective_on: effectiveOn,
    note: '',
    purchase_uom: 'case',
    pack_quantity: 20,
    pack_quantity_uom: 'lb',
    created_at: `${effectiveOn}T12:00:00Z`,
  };
}

const source: SupplierPricingSource = {
  items: [{
    id: itemId,
    ingredient_id: ingredientId,
    supplier_id: supplierId,
    supplier_sku: 'CARROT-20',
    purchase_uom: 'case',
    pack_quantity: 20,
    pack_quantity_uom: 'lb',
    is_preferred: true,
    active: true,
  }],
  ingredients: [{
    id: ingredientId, name: 'Carrots', internal_code: 'CAR', active: true,
  }],
  suppliers: [{ id: supplierId, name: 'Fresh Foods', active: true }],
  prices: [
    price('00000000-0000-4000-8000-000000000011', '2026-09-01', 18),
    price('00000000-0000-4000-8000-000000000012', '2026-09-20', 20),
    price('00000000-0000-4000-8000-000000000013', '2026-10-10', 22),
  ],
};

describe('supplier pricing domain', () => {
  it('derives current and next prices while retaining ordered immutable history', () => {
    const [item] = buildSupplierPricingItems(source, '2026-09-30');
    expect(item?.currentPrice?.unit_price).toBe(20);
    expect(item?.nextPrice?.unit_price).toBe(22);
    expect(item?.prices.map((entry) => entry.unit_price)).toEqual([22, 20, 18]);
    expect(item).toMatchObject({
      ingredientName: 'Carrots', supplierName: 'Fresh Foods', preferred: true, active: true,
    });
  });

  it('treats inactive linked records as unavailable for new pricing', () => {
    const [item] = buildSupplierPricingItems({
      ...source,
      suppliers: [{ id: supplierId, name: 'Fresh Foods', active: false }],
    }, '2026-09-30');
    expect(item?.active).toBe(false);
  });

  it('validates money precision, identifiers, dates, and note length', () => {
    const valid = {
      supplier_item_id: itemId,
      unit_price: '12.34',
      effective_on: '2026-09-30',
      note: '  Fall quote  ',
    };
    expect(supplierPriceInputSchema.parse(valid)).toMatchObject({
      unit_price: 12.34, note: 'Fall quote',
    });
    expect(supplierPriceInputSchema.safeParse({ ...valid, unit_price: '12.345' }).success)
      .toBe(false);
    expect(supplierPriceInputSchema.safeParse({ ...valid, effective_on: '09/30/2026' }).success)
      .toBe(false);
  });
});
