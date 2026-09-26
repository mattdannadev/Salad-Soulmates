import type { Customer } from '@/domain/customer-pricing';
import type { CustomerOrder } from '@/domain/customer-orders';
import type { MaterialPlan } from '@/domain/purchasing';
import type { ProductionPlan } from '@/domain/production';

export interface OrderCard {
  order: CustomerOrder;
  customerNotes: string;
  status: MaterialPlan['status'];
  productionStart: string | null;
}

/** Join saved order snapshots with current customer notes and planning state. */
export default function orderCards(
  orders: CustomerOrder[],
  customers: Customer[],
  plans: MaterialPlan[],
  productionPlans: ProductionPlan[],
): OrderCard[] {
  const customersById = new Map(customers.map((customer) => [customer.id, customer]));
  const plansById = new Map(plans.map((plan) => [plan.id, plan]));
  const productionById = new Map(productionPlans.map((plan) => [plan.id, plan]));

  return orders.toSorted((a, b) => b.created_at.localeCompare(a.created_at))
    .map((order) => {
      const production = productionById.get(order.id);
      return {
        order,
        customerNotes: customersById.get(order.customer_id)?.notes ?? '',
        status: plansById.get(order.id)?.status ?? 'Active',
        productionStart: production?.status === 'Cancelled' ? null : production?.start_on ?? null,
      };
    });
}
