import 'server-only';

import { z } from 'zod';
import orderPlanRpc from '@/data/order-plan-actions';
import {
  orderPlanInputSchema, orderPlanOperationSchema,
  orderDeletePreviewSchema, productionWorkProposalSchema,
} from '@/domain/order-plan-actions';
import type { OrderPlanActionResult } from '@/domain/order-plan-actions';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';

const safeMessages = [
  'Order unavailable', 'Order changed; review the proposal again', 'Proposal changed; review the proposal again',
  'Production work already exists for this order', 'Deletion preview changed; review again',
  'Order is linked to shared records and cannot be deleted', 'Confirmation does not match order reference',
  'Production proposal changed; review a new proposal', 'Resolve the proposal warnings before confirming',
  'Order records changed; review deletion again', 'Confirm the exact order reference',
  'Resolve the shared-record warnings before deleting',
  'Order has unsupported shared dependencies; no records were deleted',
];

function actionFailureMessage(error: { code?: string; message?: string }) {
  if (error.code === 'PGRST202' || /Could not find the function/i.test(error.message ?? '')) {
    return 'Production planning is not available yet because its database update has not been applied.';
  }
  return safeMessages.find((message) => (error.message ?? '').includes(message))
    ?? 'Unable to complete this order action. Review the order and try again.';
}

export default async function runOrderPlanAction(
  operation: unknown,
  input: unknown,
): Promise<OrderPlanActionResult> {
  const kind = orderPlanOperationSchema.safeParse(operation);
  const payload = orderPlanInputSchema.safeParse(input);
  if (!kind.success || !payload.success) return { ok: false, message: 'Check the order details and try again.' };
  const mutation = kind.data === 'create-production' || kind.data === 'delete-order';
  if (mutation && !payload.data.fingerprint) return { ok: false, message: 'Review the proposal before confirming.' };
  if (kind.data === 'delete-order' && !payload.data.confirmation) return { ok: false, message: 'Confirm the order deletion before continuing.' };
  const { db } = await requireProfile({ readOnly: !mutation });
  const deletion = kind.data === 'preview-delete' || kind.data === 'delete-order';
  const permissions = deletion ? [
    'orders.read', 'orders.write', 'planning.write', 'workforce.manage', 'inventory.adjust',
  ] : [
    'orders.read', 'orders.write', 'planning.read', 'planning.write', 'inventory.read', 'workforce.manage',
  ];
  const allowed = await Promise.all(permissions.map((permission) => hasPermission(db, permission)));
  if (allowed.some((permission) => !permission)) {
    return { ok: false, message: 'Order and production planning permission required.' };
  }
  try {
    const result = await orderPlanRpc(db, kind.data, payload.data);
    if (result.error) {
      logFailure(`order_${kind.data}`, result.error);
      return { ok: false, message: actionFailureMessage(result.error) };
    }
    if (kind.data === 'preview-production') {
      return { ok: true, kind: 'proposal', data: productionWorkProposalSchema.parse(result.data) };
    }
    if (kind.data === 'preview-delete') {
      return { ok: true, kind: 'delete-preview', data: orderDeletePreviewSchema.parse(result.data) };
    }
    const saved = kind.data === 'delete-order'
      ? z.object({
        order_id: z.uuid(), deleted: z.literal(true), deleted_records: z.number(),
      }).parse(result.data)
      : z.object({
        order_id: z.uuid(), created: z.boolean(), event_count: z.number(), batch_count: z.number(),
      }).parse(result.data);
    if (saved.order_id !== payload.data.order_id) throw new Error('Invalid order action response');
    return { ok: true, kind: 'saved', message: kind.data === 'delete-order' ? 'Order and associated records deleted.' : 'Production plan and work orders created.' };
  } catch (error) {
    logFailure(`order_${kind.data}`, error);
    return { ok: false, message: 'The action could not be confirmed. Reload and review the order before retrying.' };
  }
}
