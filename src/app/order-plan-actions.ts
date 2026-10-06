'use server';

import { revalidatePath } from 'next/cache';
import runOrderPlanAction from '@/services/order-plan-actions';
import type { OrderPlanOperation } from '@/domain/order-plan-actions';

/** Keep cache effects at the framework boundary; use cases authorize and validate. */
export default async function orderPlanAction(operation: OrderPlanOperation, input: unknown) {
  const result = await runOrderPlanAction(operation, input);
  if (result.ok && (operation === 'create-production' || operation === 'delete-order')) {
    ['/app/orders', '/app/scheduling', '/app/purchasing', '/app/production', '/app/shipping', '/app/work-orders']
      .forEach((path) => revalidatePath(path));
  }
  return result;
}
