import { z } from 'zod';
import type { CustomerOrder } from './customer-orders';
import type { SupplierItem } from './master-data';
import type { MaterialPlan, PurchaseDraft, PurchaseLine } from './purchasing';
import { QUANTITY_SCALE } from './format';

export interface PurchaseReceipt { purchase_draft_line_id: string | null; quantity: number }

/** Receipts, not an editable status, determine partial and complete delivery. */
export function purchaseProgress(
  draft: PurchaseDraft,
  lines: PurchaseLine[],
  receipts: PurchaseReceipt[],
) {
  const ownLines = lines.filter((line) => line.purchase_draft_id === draft.id);
  const balances = ownLines.map((line) => {
    const receivedTicks = receipts.filter((receipt) => receipt.purchase_draft_line_id === line.id)
      .reduce((sum, receipt) => sum + Math.round(
        z.number().finite().nonnegative().parse(receipt.quantity) * QUANTITY_SCALE,
      ), 0);
    const remainingTicks = Math.round(line.quantity * QUANTITY_SCALE) - receivedTicks;
    if (remainingTicks < 0) throw new Error('Received quantity exceeds the confirmed purchase.');
    return {
      line, received: receivedTicks / QUANTITY_SCALE, remaining: remainingTicks / QUANTITY_SCALE,
    };
  });
  const hasReceipts = balances.some((balance) => balance.received > 0);
  const received = balances.length > 0 && balances.every((balance) => balance.remaining === 0);
  let status: string = draft.status;
  if (draft.status === 'Confirmed' && received) status = 'Received';
  else if (draft.status === 'Confirmed' && hasReceipts) status = 'Partially received';
  return {
    status, balances, hasReceipts, open: draft.status !== 'Cancelled' && !received,
  };
}

export function purchaseStatusLabel(status: string, locale: 'en' | 'es') {
  const labels: Record<string, string> = {
    Draft: 'Borrador',
    Confirmed: 'Confirmado',
    Cancelled: 'Cancelado',
    Received: 'Recibido',
    'Partially received': 'Recibido parcialmente',
  };
  return locale === 'es' ? labels[status] ?? status : status;
}

/** Match active customer demand by ingredient IDs or a recorded purchase, never by name. */
export function supplierCustomerOrders(
  supplierId: string,
  orders: CustomerOrder[],
  plans: MaterialPlan[],
  packs: SupplierItem[],
  drafts: PurchaseDraft[],
) {
  const ingredients = new Set(packs.filter((pack) => pack.active && pack.supplier_id === supplierId)
    .map((pack) => pack.ingredient_id));
  return orders.filter((order) => {
    const plan = plans.find((candidate) => candidate.id === order.id);
    return plan?.status === 'Active' && (
      plan.requirements.some((requirement) => ingredients.has(requirement.ingredient_id))
      || drafts.some((draft) => draft.supplier_id === supplierId
        && draft.material_plan_id === order.id)
    );
  }).sort((a, b) => a.customer_name.localeCompare(b.customer_name)
    || a.needed_on.localeCompare(b.needed_on) || a.created_at.localeCompare(b.created_at));
}
