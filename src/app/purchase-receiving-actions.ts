'use server';

import { revalidatePath } from 'next/cache';
import { purchaseDeliverySchema, type PurchaseDeliveryResult } from '@/domain/purchase-receiving';
import { requireProfile } from '@/lib/auth';
import { logFailure } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';

const correctionMessages = [
  'Purchase delivery lines are required',
  'Delivery request, supplier and received date are required',
  'Enter 1 to 100 receipt lines',
  'Supplier reference or note is too long',
  'Receipt line IDs must be unique',
  'Receipt line and purchase line IDs are required',
  'Quantity must be positive with at most four decimal places',
  'Supplier lot is too long',
  'Enter packages for every receipt line',
  'Package quantity must be positive with at most four decimals',
  'Supplier barcode must be printable ASCII without spaces or the SSU- prefix',
  'A delivery may contain at most',
  'Each supplier barcode must identify one physical package',
  'Package quantities must equal',
  'Purchase receipt line IDs must be unique',
  'Purchase delivery must use one supplier',
  'Purchase delivery supplier does not match',
  'Enter no more than 200 packages per delivery',
  'Select confirmed inbound from one active supplier in this facility',
  'Receipt exceeds the outstanding inbound quantity',
  'Choose an active supplier',
  'Source-lot sequence is exhausted for this facility date',
];

const affectedPaths = [
  '/app/receiving',
  '/receiving',
  '/app/inventory',
  '/app',
  '/app/materials',
  '/app/orders',
  '/app/purchasing',
  '/app/suppliers',
  '/app/traceability',
  '/receiving/packages',
  '/receiving/labels',
];

/** Post a PO delivery atomically while retaining its request token across uncertain retries. */
export default async function receivePurchaseDelivery(
  input: unknown,
): Promise<PurchaseDeliveryResult> {
  const parsed = purchaseDeliverySchema.safeParse(input);
  if (!parsed.success) {
    return {
      ok: false,
      message: parsed.error.issues[0]?.message ?? 'Check the delivery fields.',
      retry: 'new_request',
    };
  }
  const { db, profile } = await requireProfile({ readOnly: false });
  const [canRead, canReceive] = await Promise.all([
    hasPermission(db, 'inventory.read'),
    hasPermission(db, 'inventory.receive'),
  ]);
  if (!canRead || !canReceive) {
    return {
      ok: false,
      message: 'Receiving permission is required to post this delivery.',
      retry: 'new_request',
    };
  }
  try {
    const result = await db.rpc('receive_purchase_delivery', { payload: parsed.data });
    if (result.error) {
      logFailure('receive_purchase_delivery', result.error);
      if (result.error.message.includes('Request ID already used with different values')) {
        const existing = await db
          .from('inventory_receipts')
          .select('id')
          .eq('delivery_request_id', parsed.data.request_id)
          .eq('created_by', profile.id)
          .maybeSingle();
        if (existing.error) {
          logFailure('receive_purchase_delivery_reconcile', existing.error);
          return {
            ok: false,
            message: 'This request may already have posted. Retry the same delivery before starting another one.',
            retry: 'same_request',
          };
        }
        const receiptId = purchaseDeliverySchema.shape.request_id.safeParse(existing.data?.id);
        return {
          ok: false,
          id: receiptId.success ? receiptId.data : undefined,
          message: receiptId.success
            ? 'This request token belongs to an existing receipt. Review it before clearing the pending submission.'
            : 'This request token conflicts with saved work. Review receipt history before clearing the pending submission.',
          retry: 'review_existing',
        };
      }
      const knownMessage = correctionMessages.find((message) => (
        result.error.message.includes(message)
      ));
      if (knownMessage) {
        return { ok: false, message: knownMessage, retry: 'new_request' };
      }
      if (result.error.code === '23505') {
        return {
          ok: false,
          message: 'A supplier barcode is already assigned to another physical package.',
          retry: 'new_request',
        };
      }
      return {
        ok: false,
        message: 'The delivery result could not be confirmed. Retry the same delivery without editing it.',
        retry: 'same_request',
      };
    }
    const receiptId = purchaseDeliverySchema.shape.request_id.safeParse(result.data);
    if (!receiptId.success) {
      logFailure('receive_purchase_delivery', { code: 'INVALID_RESPONSE' });
      return {
        ok: false,
        message: 'The delivery result could not be confirmed. Retry the same delivery without editing it.',
        retry: 'same_request',
      };
    }
    affectedPaths.forEach((path) => revalidatePath(path));
    revalidatePath('/receiving/packages/[id]', 'page');
    return {
      ok: true,
      id: receiptId.data,
      message: 'Delivery received, inventory updated, and package labels are ready.',
    };
  } catch (error) {
    logFailure('receive_purchase_delivery', error);
    return {
      ok: false,
      message: 'Connection interrupted. Retry the same delivery without editing it.',
      retry: 'same_request',
    };
  }
}
