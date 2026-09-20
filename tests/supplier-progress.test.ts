import { expect, it } from 'vitest';
import { customerOrderRowSchema } from '@/domain/customer-orders';
import { supplierItemRowSchema } from '@/domain/master-data';
import { materialPlanRowSchema, purchaseDraftRowSchema, purchaseLineRowSchema } from '@/domain/purchasing';
import { purchaseProgress, supplierCustomerOrders } from '@/domain/supplier-orders';
import { fixtureId } from './browser/fixture-data';

const order = customerOrderRowSchema.parse({
  id: fixtureId(601),
  customer_id: fixtureId(603),
  customer_name: 'Customer',
  reference: 'ORDER-1',
  needed_on: '2026-10-01',
  created_at: '2026-09-20T12:00:00Z',
  products: [{ product_id: fixtureId(300), batch_count: 1 }],
  items: [{
    product_id: fixtureId(300),
    batch_count: 1,
    product_name: 'Dressing',
    recipe_version_id: fixtureId(401),
    version_number: 1,
    batch_gallons: 40,
    packaging_label: 'Default',
    unit_name: 'case',
    gallons_per_unit: 4,
    unit_price: null,
    currency: 'USD',
    unit_count: 10,
    line_total: null,
  }],
});
const plan = materialPlanRowSchema.parse({
  id: order.id,
  name: 'Estimate',
  needed_on: order.needed_on,
  batches: [],
  status: 'Active',
  created_at: order.created_at,
  requirements: [{
    ingredient_id: fixtureId(100), ingredient_name: 'Garlic', uom: 'lb', required: 1, contributions: [],
  }],
});
const pack = supplierItemRowSchema.parse({
  id: fixtureId(210),
  ingredient_id: fixtureId(100),
  supplier_id: fixtureId(200),
  supplier_sku: '',
  purchase_uom: 'pail',
  pack_quantity: 30,
  pack_quantity_uom: 'lb',
  is_preferred: true,
  active: true,
  notes: '',
});
const draft = purchaseDraftRowSchema.parse({
  id: fixtureId(600),
  material_plan_id: order.id,
  supplier_id: pack.supplier_id,
  expected_on: '2026-09-28',
  status: 'Confirmed',
  reference: 'PO-100',
  note: '',
  revision: 2,
  created_at: '2026-09-20T12:00:00Z',
});
const line = purchaseLineRowSchema.parse({
  id: fixtureId(602),
  purchase_draft_id: draft.id,
  ingredient_id: pack.ingredient_id,
  supplier_item_id: pack.id,
  ingredient_name: 'Garlic',
  supplier_sku: '',
  uom: 'lb',
  purchase_uom: 'pail',
  pack_quantity: 30,
  raw_shortage: 40,
  recommended_units: 2,
  purchase_units: 2,
  quantity: 60,
  override_reason: '',
});
it('shows demand before a purchase exists and retains links after packs become inactive', () => {
  expect(supplierCustomerOrders(pack.supplier_id, [order], [plan], [pack], [])).toEqual([order]);
  const inactive = { ...pack, active: false };
  expect(supplierCustomerOrders(pack.supplier_id, [order], [plan], [inactive], [])).toEqual([]);
  expect(supplierCustomerOrders(pack.supplier_id, [order], [plan], [], [draft])).toEqual([order]);
});
it('excludes cancelled orders, unrelated suppliers and matching names with different IDs', () => {
  const cancelled = { ...plan, status: 'Cancelled' as const };
  const cancelledOrders = supplierCustomerOrders(
    pack.supplier_id,
    [order],
    [cancelled],
    [pack],
    [draft],
  );
  expect(cancelledOrders).toEqual([]);
  expect(supplierCustomerOrders(fixtureId(999), [order], [plan], [pack], [draft])).toEqual([]);
  const unrelated = { ...pack, ingredient_id: fixtureId(999) };
  expect(supplierCustomerOrders(pack.supplier_id, [order], [plan], [unrelated], [])).toEqual([]);
});
it('sorts each customer’s outstanding orders by needed date without dropping repeated products', () => {
  const later = { ...order, id: fixtureId(604), needed_on: '2026-11-01' };
  const plans = [plan, { ...plan, id: later.id }];
  const result = supplierCustomerOrders(pack.supplier_id, [later, order], plans, [pack], []);
  expect(result.map((item) => item.id)).toEqual([order.id, later.id]);
});
it('derives partial and complete receipt without changing stored purchase status', () => {
  expect(purchaseProgress(draft, [line], []).status).toBe('Confirmed');
  const partialReceipts = [{ purchase_draft_line_id: line.id, quantity: 10 }];
  const partial = purchaseProgress(draft, [line], partialReceipts);
  expect(partial).toMatchObject({ status: 'Partially received', open: true });
  expect(partial.balances[0]?.remaining).toBe(50);
  expect(purchaseProgress(draft, [line], [{ purchase_draft_line_id: line.id, quantity: 60 }]))
    .toMatchObject({ status: 'Received', open: false });
  expect(draft.status).toBe('Confirmed');
  expect(purchaseProgress({ ...draft, status: 'Cancelled' }, [line], []).open).toBe(false);
  expect(purchaseProgress({ ...draft, status: 'Draft' }, [line], []).status).toBe('Draft');
});
it('requires every line to be received and keeps decimal arithmetic exact', () => {
  const smallLine = { ...line, quantity: 0.3 };
  const receipts = [0.1, 0.2].map((quantity) => ({ purchase_draft_line_id: line.id, quantity }));
  expect(purchaseProgress(draft, [smallLine], receipts).status).toBe('Received');
  expect(purchaseProgress(draft, [smallLine, { ...line, id: fixtureId(605) }], receipts).status).toBe('Partially received');
  expect(purchaseProgress(draft, [], []).status).toBe('Confirmed');
  expect(() => purchaseProgress(draft, [line], [{ purchase_draft_line_id: line.id, quantity: 61 }])).toThrow('exceeds');
});
