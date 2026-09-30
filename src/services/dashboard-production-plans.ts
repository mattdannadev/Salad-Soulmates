import type { CustomerOrder } from '@/domain/customer-orders';
import type { ProductionPlan } from '@/domain/production';

export interface DashboardProductionPlan {
  id: string;
  customerName: string;
  pickupOn: string | null;
  status: ProductionPlan['status'];
  products: { name: string; batchCount: number }[];
  spansOutsideWindow: boolean;
}

/** Order quotas are full-plan quantities; dates alone cannot allocate them to a week. */
export function dashboardProductionPlans(
  plans: ProductionPlan[],
  orders: CustomerOrder[],
  startOn: string,
  endOn: string,
  limit: number,
): DashboardProductionPlan[] {
  const ordersById = new Map(orders.map((order) => [order.id, order]));
  return plans
    .filter((plan) => plan.status !== 'Cancelled' && plan.start_on < endOn && plan.finish_on >= startOn)
    .toSorted((left, right) => left.start_on.localeCompare(right.start_on) || left.id.localeCompare(right.id))
    .slice(0, limit)
    .map((plan) => {
      const order = ordersById.get(plan.id);
      return {
        id: plan.id,
        customerName: order?.customer_name ?? '',
        pickupOn: order?.needed_on ?? null,
        status: plan.status,
        products: (order?.items ?? []).map((item) => ({ name: item.product_name, batchCount: item.batch_count })),
        spansOutsideWindow: plan.start_on < startOn || plan.finish_on >= endOn,
      };
    });
}
