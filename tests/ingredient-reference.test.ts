import { describe, expect, it } from 'vitest';
import { ingredientReferenceQuantities } from '@/domain/ingredient-reference';
import type { MaterialPlan, PurchaseDraft, PurchaseLine } from '@/domain/purchasing';

const ingredientId = '00000000-0000-4000-8000-000000000001';
const otherIngredientId = '00000000-0000-4000-8000-000000000002';
const purchaseId = '00000000-0000-4000-8000-000000000003';
const purchaseLineId = '00000000-0000-4000-8000-000000000004';
const planId = '00000000-0000-4000-8000-000000000005';

const confirmedPurchase: PurchaseDraft = {
  id: purchaseId,
  material_plan_id: null,
  supplier_id: '00000000-0000-4000-8000-000000000006',
  expected_on: '2026-10-01',
  status: 'Confirmed',
  reference: 'PO-100',
  note: '',
  total_cost: null,
  placed_on: null,
  revision: 1,
  created_at: '2026-09-29T00:00:00Z',
};
const purchaseLine: PurchaseLine = {
  id: purchaseLineId,
  purchase_draft_id: purchaseId,
  ingredient_id: ingredientId,
  supplier_item_id: '00000000-0000-4000-8000-000000000007',
  ingredient_name: 'Garlic powder',
  supplier_sku: 'GARLIC',
  uom: 'lb',
  purchase_uom: 'bag',
  pack_quantity: 10,
  raw_shortage: 10,
  recommended_units: 1,
  purchase_units: 1,
  quantity: 10,
  override_reason: '',
};
const activePlan: MaterialPlan = {
  id: planId,
  name: 'October production',
  needed_on: '2026-10-01',
  batches: [{ recipe_version_id: '00000000-0000-4000-8000-000000000008', batch_count: 1 }],
  requirements: [{
    ingredient_id: ingredientId,
    ingredient_name: 'Garlic powder',
    uom: 'lb',
    required: 7,
    contributions: [],
  }],
  status: 'Active',
  created_at: '2026-09-29T00:00:00Z',
};

describe('ingredient reference quantities', () => {
  it('keeps on hand, confirmed inbound, and active-plan commitments distinct', () => {
    expect(ingredientReferenceQuantities(
      ingredientId,
      [
        { ingredient_id: ingredientId, quantity_delta: 12 },
        { ingredient_id: ingredientId, quantity_delta: -2 },
        { ingredient_id: otherIngredientId, quantity_delta: 99 },
      ],
      [confirmedPurchase, { ...confirmedPurchase, id: '00000000-0000-4000-8000-000000000009', status: 'Draft' }],
      [purchaseLine, { ...purchaseLine, id: '00000000-0000-4000-8000-000000000010', purchase_draft_id: '00000000-0000-4000-8000-000000000009' }],
      [{ purchase_draft_line_id: purchaseLineId, quantity: 3 }],
      [activePlan, { ...activePlan, id: '00000000-0000-4000-8000-000000000011', status: 'Cancelled' }],
    )).toEqual({ onHand: 10, inbound: 7, committed: 7 });
  });
});
