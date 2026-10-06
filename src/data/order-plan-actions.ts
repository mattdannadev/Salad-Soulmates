import 'server-only';

import type { supabase } from '@/lib/supabase';
import type { OrderPlanOperation } from '@/domain/order-plan-actions';
import { orderPlanInputSchema } from '@/domain/order-plan-actions';
import type { z } from 'zod';

const rpcNames = {
  'preview-production': 'preview_order_production_work',
  'create-production': 'create_order_production_work',
  'preview-delete': 'preview_delete_customer_order',
  'delete-order': 'delete_customer_order',
} as const;

/** Execute within the signed-in session; the RPC enforces tenant/facility scope atomically. */
export default function orderPlanRpc(
  db: Awaited<ReturnType<typeof supabase>>,
  operation: OrderPlanOperation,
  payload: z.infer<typeof orderPlanInputSchema>,
) {
  return db.rpc(rpcNames[operation], { payload });
}
