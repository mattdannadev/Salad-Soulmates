import { describe, expect, it } from 'vitest';
import {
  materialPlanInputSchema,
  purchaseDraftInputSchema,
  purchaseStatusInputSchema,
  recommendPurchase,
  selectSupplierPack,
  outstandingInbound,
} from '@/domain/purchasing';

const id = '00000000-0000-4000-8000-000000000001';
const line = {
  id,
  purchase_draft_id: id,
  ingredient_id: id,
  supplier_item_id: id,
  ingredient_name: 'Garlic',
  supplier_sku: 'GARLIC',
  uom: 'lb',
  purchase_uom: 'pail',
  pack_quantity: 30,
  raw_shortage: 70,
  recommended_units: 3,
  purchase_units: 3,
  quantity: 90,
  override_reason: '',
};
const draft = {
  id,
  material_plan_id: id,
  supplier_id: id,
  expected_on: '2026-10-01',
  status: 'Confirmed' as const,
  reference: 'EXTERNAL-1',
  note: '',
  revision: 2,
  created_at: '2026-09-20T00:00:00Z',
};

describe('purchasing input and display calculations', () => {
  it('requires unique recipe versions and whole batch counts', () => {
    const plan = {
      id,
      name: 'Plan',
      needed_on: '2026-10-01',
      batches: [{ recipe_version_id: id, batch_count: 1 }],
    };
    expect(materialPlanInputSchema.safeParse(plan).success).toBe(true);
    expect(
      materialPlanInputSchema.safeParse({
        ...plan,
        batches: [...plan.batches, ...plan.batches],
      }).success,
    ).toBe(false);
    expect(
      materialPlanInputSchema.safeParse({
        ...plan,
        batches: [{ recipe_version_id: id, batch_count: 0.5 }],
      }).success,
    ).toBe(false);
  });
  it('rounds 70 lb to three 30 lb pails and explains the overage', () => {
    expect(recommendPurchase(70, 30)).toEqual({ units: 3, quantity: 90, overage: 20 });
  });
  it('does not buy an extra pack from decimal division noise', () => {
    expect(recommendPurchase(0.21, 0.07)).toEqual({
      units: 3,
      quantity: 0.21,
      overage: 0,
    });
    expect(() => recommendPurchase(Number.NaN, 1)).toThrow();
    expect(() => recommendPurchase(1, 0)).toThrow();
  });
  it('chooses preferred, then sole active, and requires selection for ambiguous packs', () => {
    const first = { id: 'one', active: true, is_preferred: false };
    const second = { id: 'two', active: true, is_preferred: true };
    expect(selectSupplierPack([first, second])).toEqual(second);
    expect(selectSupplierPack([first])).toEqual(first);
    expect(
      selectSupplierPack([first, { ...second, is_preferred: false }]),
    ).toBeUndefined();
    expect(selectSupplierPack([{ ...second, active: false }])).toBeUndefined();
  });
  it('rejects duplicate ingredients and fractional purchase units', () => {
    const input = {
      id,
      material_plan_id: id,
      supplier_id: id,
      expected_on: '2026-10-01',
      lines: [
        {
          ingredient_id: id,
          supplier_item_id: id,
          purchase_units: 2,
          override_reason: '',
        },
      ],
    };
    expect(purchaseDraftInputSchema.safeParse(input).success).toBe(true);
    expect(
      purchaseDraftInputSchema.safeParse({
        ...input,
        lines: [...input.lines, ...input.lines],
      }).success,
    ).toBe(false);
  });
  it('requires an external confirmation reference and a cancellation reason', () => {
    const input = {
      id,
      status: 'Confirmed',
      revision: 1,
      reference: '',
      note: '',
    };
    expect(purchaseStatusInputSchema.safeParse(input).success).toBe(false);
    expect(
      purchaseStatusInputSchema.safeParse({ ...input, reference: 'PO-1' }).success,
    ).toBe(true);
    expect(
      purchaseStatusInputSchema.safeParse({ ...input, status: 'Cancelled' }).success,
    ).toBe(false);
  });
  it('counts only unreceived confirmed quantities and removes fully received lines', () => {
    expect(
      outstandingInbound(
        [draft],
        [line],
        [{ purchase_draft_line_id: id, quantity: 10 }],
      )[0]?.remaining,
    ).toBe(80);
    expect(
      outstandingInbound([draft], [line], [{ purchase_draft_line_id: id, quantity: 90 }]),
    ).toEqual([]);
    expect(outstandingInbound([{ ...draft, status: 'Draft' }], [line], [])).toEqual([]);
    expect(outstandingInbound([{ ...draft, status: 'Cancelled' }], [line], [])).toEqual(
      [],
    );
    expect(() => outstandingInbound([draft], [line], [{ purchase_draft_line_id: id, quantity: 91 }])).toThrow('exceeds');
  });
});
