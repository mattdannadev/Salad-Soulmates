import { z } from 'zod';
import { QUANTITY_SCALE } from './format';
import { packageSchema } from './receiving';
import type { ReceiptLine, Supplier } from './master-data';
import type { PurchaseDraft, PurchaseLine } from './purchasing';

export const MAX_PURCHASE_RECEIPT_LINES = 100;
export const MAX_PURCHASE_RECEIPT_PACKAGES = 200;

const optionalDateSchema = z.preprocess(
  (value) => (value === '' ? null : value),
  z.iso.date().nullable(),
);

export const purchaseReceiptLineSchema = z.object({
  id: z.uuid(),
  purchase_draft_line_id: z.uuid(),
  quantity: z.number().positive().max(1000000).multipleOf(0.0001),
  supplier_lot: z.string().max(120),
  expiration_date: optionalDateSchema,
  packages: z.array(packageSchema).min(1).max(MAX_PURCHASE_RECEIPT_PACKAGES),
}).refine(
  (line) => line.packages.reduce(
    (sum, entry) => sum + Math.round(entry.quantity * QUANTITY_SCALE),
    0,
  ) === Math.round(line.quantity * QUANTITY_SCALE),
  'Package quantities must equal the actual received quantity for each source lot.',
);

export const purchaseDeliverySchema = z.object({
  request_id: z.uuid(),
  supplier_id: z.uuid(),
  received_on: z.iso.date(),
  supplier_reference: z.string().trim().max(120),
  note: z.string().trim().max(1000),
  lines: z.array(purchaseReceiptLineSchema).min(1).max(MAX_PURCHASE_RECEIPT_LINES),
}).superRefine((delivery, context) => {
  if (new Set(delivery.lines.map((line) => line.id)).size !== delivery.lines.length) {
    context.addIssue({
      code: 'custom',
      path: ['lines'],
      message: 'Purchase receipt line IDs must be unique.',
    });
  }
  const packageCount = delivery.lines.reduce((sum, line) => sum + line.packages.length, 0);
  if (packageCount > MAX_PURCHASE_RECEIPT_PACKAGES) {
    context.addIssue({
      code: 'custom',
      path: ['lines'],
      message: `A delivery may contain at most ${MAX_PURCHASE_RECEIPT_PACKAGES} physical packages.`,
    });
  }
  const supplierBarcodes = delivery.lines.flatMap((line) => (
    line.packages.map((entry) => entry.supplier_barcode).filter(Boolean)
  ));
  if (new Set(supplierBarcodes).size !== supplierBarcodes.length) {
    context.addIssue({
      code: 'custom',
      path: ['lines'],
      message: 'Each supplier barcode must identify one physical package in this delivery.',
    });
  }
});

export type PurchaseDelivery = z.infer<typeof purchaseDeliverySchema>;

export interface PurchaseReceivingLine {
  id: string;
  ingredientId: string;
  ingredientName: string;
  supplierSku: string;
  purchaseUom: string;
  packQuantity: number;
  uom: string;
  ordered: number;
  received: number;
  outstanding: number;
}

export interface PurchaseReceivingOrder {
  id: string;
  supplierId: string;
  supplierName: string;
  reference: string;
  expectedOn: string;
  createdAt: string;
  lines: PurchaseReceivingLine[];
}

function quantityTicks(value: number) {
  if (!Number.isFinite(value)) throw new Error('Purchase quantity must be finite.');
  return Math.round(value * QUANTITY_SCALE);
}

/** Build every open confirmed PO from immutable purchase snapshots and linked receipts. */
export function buildPurchaseReceivingOrders(
  drafts: PurchaseDraft[],
  purchaseLines: PurchaseLine[],
  receiptLines: Pick<ReceiptLine, 'purchase_draft_line_id' | 'quantity'>[],
  suppliers: Supplier[],
): PurchaseReceivingOrder[] {
  const supplierNames = new Map(suppliers.map((supplier) => [supplier.id, supplier.name]));
  const receiptTicks = new Map<string, number>();
  receiptLines.forEach((receipt) => {
    if (!receipt.purchase_draft_line_id) return;
    receiptTicks.set(
      receipt.purchase_draft_line_id,
      (receiptTicks.get(receipt.purchase_draft_line_id) ?? 0) + quantityTicks(receipt.quantity),
    );
  });
  return drafts.flatMap((draft) => {
    if (draft.status !== 'Confirmed') return [];
    const lines = purchaseLines
      .filter((line) => line.purchase_draft_id === draft.id)
      .map((line) => {
        const orderedTicks = quantityTicks(line.quantity);
        const received = receiptTicks.get(line.id) ?? 0;
        const outstanding = orderedTicks - received;
        if (outstanding < 0) throw new Error('Received quantity exceeds the confirmed purchase.');
        return {
          id: line.id,
          ingredientId: line.ingredient_id,
          ingredientName: line.ingredient_name,
          supplierSku: line.supplier_sku,
          purchaseUom: line.purchase_uom,
          packQuantity: line.pack_quantity,
          uom: line.uom,
          ordered: orderedTicks / QUANTITY_SCALE,
          received: received / QUANTITY_SCALE,
          outstanding: outstanding / QUANTITY_SCALE,
        };
      });
    if (!lines.some((line) => line.outstanding > 0)) return [];
    return [{
      id: draft.id,
      supplierId: draft.supplier_id,
      supplierName: supplierNames.get(draft.supplier_id) ?? 'Supplier unavailable',
      reference: draft.reference,
      expectedOn: draft.expected_on,
      createdAt: draft.created_at,
      lines,
    }];
  }).sort((left, right) => (
    left.expectedOn.localeCompare(right.expectedOn)
      || left.createdAt.localeCompare(right.createdAt)
      || left.id.localeCompare(right.id)
  ));
}

export type PurchaseDeliveryResult = | { ok: true; id: string; message: string }
  | {
    ok: false;
    message: string;
    retry: 'same_request' | 'new_request' | 'review_existing';
    id?: string;
  };
