import type { CustomerOrder } from '@/domain/customer-orders';
import type { ProductionPlan } from '@/domain/production';

export interface DashboardScheduleOrderContext {
  id: string;
  customerName: string;
  orderReference: string | null;
  pickupOn: string | null;
  products: { id: string; name: string; batchCount: number | null }[];
}

export interface DashboardProductionPlan extends DashboardScheduleOrderContext {
  status: ProductionPlan['status'];
  products: { id: string; name: string; batchCount: number }[];
  spansOutsideWindow: boolean;
}

interface ScheduleContextEvent {
  productionPlanId: string | null;
  productId: string | null;
}

/** Build display-only order context from workforce-authorized schedule reads. */
export function dashboardScheduleOrderContexts(
  orders: {
    id: string; customerName: string; orderReference: string; pickupOn: string;
  }[],
  products: { id: string; name: string }[],
  events: ScheduleContextEvent[],
): DashboardScheduleOrderContext[] {
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  return orders.map((order) => {
    const productIds = new Set(events.flatMap((event) => (
      event.productionPlanId === order.id && event.productId ? [event.productId] : []
    )));
    return {
      id: order.id,
      customerName: order.customerName,
      orderReference: order.orderReference || null,
      pickupOn: order.pickupOn,
      products: [...productIds].flatMap((id) => {
        const name = productNames.get(id);
        return name ? [{ id, name, batchCount: null }] : [];
      }),
    };
  });
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
    .toSorted((left, right) => (
      left.start_on.localeCompare(right.start_on) || left.id.localeCompare(right.id)
    ))
    .slice(0, limit)
    .map((plan) => {
      const order = ordersById.get(plan.id);
      return {
        id: plan.id,
        customerName: order?.customer_name ?? '',
        orderReference: order?.reference || null,
        pickupOn: order?.needed_on ?? null,
        status: plan.status,
        products: (order?.items ?? []).map((item) => ({
          id: item.product_id,
          name: item.product_name,
          batchCount: item.batch_count,
        })),
        spansOutsideWindow: plan.start_on < startOn || plan.finish_on >= endOn,
      };
    });
}
