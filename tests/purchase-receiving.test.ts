import { describe, expect, it } from 'vitest';
import {
  buildPurchaseReceivingOrders,
  purchaseDeliverySchema,
} from '@/domain/purchase-receiving';
import type { ReceiptLine, Supplier } from '@/domain/master-data';
import type { PurchaseDraft, PurchaseLine } from '@/domain/purchasing';

const id = (value: number) => (
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
);

function delivery() {
  return {
    request_id: id(1),
    supplier_id: id(2),
    received_on: '2026-09-21',
    supplier_reference: 'DELIVERY-1',
    note: '',
    lines: [{
      id: id(10),
      purchase_draft_line_id: id(20),
      quantity: 5,
      supplier_lot: '  LOT 42  ',
      expiration_date: null,
      packages: [{ quantity: 5, supplier_barcode: 'PACKAGE-1' }],
    }],
  };
}

describe('purchase delivery contract', () => {
  it('preserves supplier lot evidence and accepts multiple source lots for one PO line', () => {
    const input = delivery();
    const [firstLine] = input.lines;
    if (!firstLine) throw new Error('Delivery fixture requires a line.');
    input.lines.push({
      ...firstLine,
      id: id(11),
      quantity: 3,
      supplier_lot: '',
      packages: [{ quantity: 3, supplier_barcode: '' }],
    });
    const parsed = purchaseDeliverySchema.parse(input);
    expect(parsed.lines[0]?.supplier_lot).toBe('  LOT 42  ');
    expect(parsed.lines.map((line) => line.purchase_draft_line_id)).toEqual([id(20), id(20)]);
  });

  it('rejects duplicate line identities, incorrect package totals, and delivery limits', () => {
    const input = delivery();
    expect(purchaseDeliverySchema.safeParse({
      ...input,
      lines: [input.lines[0], { ...input.lines[0] }],
    }).success).toBe(false);
    expect(purchaseDeliverySchema.safeParse({
      ...input,
      lines: [{ ...input.lines[0], packages: [{ quantity: 4, supplier_barcode: '' }] }],
    }).success).toBe(false);
    expect(purchaseDeliverySchema.safeParse({
      ...input,
      lines: Array.from({ length: 101 }, (_, index) => ({
        ...input.lines[0],
        id: id(1000 + index),
      })),
    }).success).toBe(false);
    expect(purchaseDeliverySchema.safeParse({
      ...input,
      lines: [{
        ...input.lines[0],
        quantity: 201,
        packages: Array.from({ length: 201 }, () => ({ quantity: 1, supplier_barcode: '' })),
      }],
    }).success).toBe(false);
  });
});

describe('open PO receiving read model', () => {
  const supplier: Supplier = {
    id: id(2),
    name: 'Supplier A',
    contact_name: '',
    email: '',
    phone: '',
    lead_time_days: 0,
    active: true,
  };
  const draft = (value: number, status: PurchaseDraft['status']): PurchaseDraft => ({
    id: id(value),
    material_plan_id: null,
    supplier_id: supplier.id,
    expected_on: '2026-09-24',
    status,
    reference: `PO-${value}`,
    note: '',
    revision: 1,
    created_at: '2026-09-21T12:00:00Z',
  });
  const line = (value: number, purchaseId: string, quantity: number): PurchaseLine => ({
    id: id(value),
    purchase_draft_id: purchaseId,
    ingredient_id: id(100),
    supplier_item_id: id(200),
    ingredient_name: 'Garlic',
    supplier_sku: 'GARLIC-25',
    uom: 'lb',
    purchase_uom: 'bag',
    pack_quantity: 25,
    raw_shortage: quantity,
    recommended_units: 2,
    purchase_units: 2,
    quantity,
    override_reason: '',
  });
  const receipt = (value: number, lineId: string, quantity: number): ReceiptLine => ({
    id: id(value),
    receipt_id: id(500 + value),
    purchase_draft_line_id: lineId,
    ingredient_id: id(100),
    quantity,
    uom: 'lb',
    supplier_lot: '',
    assigned_source_lot: null,
    source_lot_origin: null,
    expiration_date: null,
  });

  it('combines receipts across deliveries and keeps all rows on each still-open confirmed PO', () => {
    const open = draft(300, 'Confirmed');
    const completed = draft(301, 'Confirmed');
    const cancelled = draft(302, 'Cancelled');
    const openLine = line(400, open.id, 50);
    const completedLineOnOpen = line(401, open.id, 10);
    const completeLine = line(402, completed.id, 20);
    const orders = buildPurchaseReceivingOrders(
      [open, completed, cancelled],
      [openLine, completedLineOnOpen, completeLine, line(403, cancelled.id, 20)],
      [
        receipt(600, openLine.id, 12),
        receipt(601, openLine.id, 8),
        receipt(602, completedLineOnOpen.id, 10),
        receipt(603, completeLine.id, 20),
      ],
      [supplier],
    );
    expect(orders).toHaveLength(1);
    expect(orders[0]).toMatchObject({ id: open.id, supplierName: supplier.name });
    expect(orders[0]?.lines).toEqual([
      expect.objectContaining({
        id: openLine.id, ordered: 50, received: 20, outstanding: 30,
      }),
      expect.objectContaining({ id: completedLineOnOpen.id, outstanding: 0 }),
    ]);
  });
});
