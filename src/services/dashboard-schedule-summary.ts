import type { DashboardScheduleOrderContext } from './dashboard-production-plans';

export interface DashboardBatchEvent {
  id: string;
  startOn: string;
  kind: string;
  productionPlanId: string | null;
  linkedTaskType: string | null;
  linkedTaskId?: string | null;
  customerId?: string | null;
  batchCount?: number | null;
  assigneeNames?: string[];
}

interface DailyBatches {
  date: string;
  prep: number;
  production: number;
  prepUnknown: boolean;
  productionUnknown: boolean;
  resources: string[];
}

interface OrderSummary {
  key: string;
  reference: string | null;
  pickupOn: string | null;
  products: DashboardScheduleOrderContext['products'];
  totalBatchCount: number | null;
  days: DailyBatches[];
}

interface CustomerSummary {
  key: string;
  name: string;
  orders: OrderSummary[];
}

/** Count allocated batches only; full-order quotas cannot establish a daily quantity. */
export function dashboardScheduleSummary(
  events: DashboardBatchEvent[],
  contexts: DashboardScheduleOrderContext[],
  pendingPlans: DashboardScheduleOrderContext[] = [],
): CustomerSummary[] {
  const contextsById = new Map(
    [...pendingPlans, ...contexts].map((context) => [context.id, context]),
  );
  const customerIds = new Map(events.flatMap((event) => (
    event.productionPlanId && event.customerId
      ? [[event.productionPlanId, event.customerId] as const] : []
  )));
  const customerIdsByName = new Map<string, string>();
  customerIds.forEach((customerId, orderId) => {
    const name = contextsById.get(orderId)?.customerName;
    if (name) customerIdsByName.set(name, customerId);
  });
  const customers = new Map<string, CustomerSummary>();
  const orders = new Map<string, OrderSummary>();
  const ensureOrder = (id: string): OrderSummary => {
    const existing = orders.get(id);
    if (existing) return existing;
    const context = contextsById.get(id);
    const name = context?.customerName ?? '';
    const customerKey = customerIds.get(id) || customerIdsByName.get(name) || name || `unknown-${id}`;
    let customer = customers.get(customerKey);
    if (!customer) {
      customer = { key: customerKey, name, orders: [] };
      customers.set(customerKey, customer);
    }
    const order = {
      key: id,
      reference: context?.orderReference ?? null,
      pickupOn: context?.pickupOn ?? null,
      products: context?.products ?? [],
      totalBatchCount: context?.products.length
        && context.products.every((product) => (
          typeof product.batchCount === 'number'
          && Number.isFinite(product.batchCount) && product.batchCount >= 0
        ))
        ? context.products.reduce((total, product) => total + (product.batchCount ?? 0), 0)
        : null,
      days: [],
    };
    customer.orders.push(order);
    orders.set(id, order);
    return order;
  };
  const counted = new Set<string>();
  events.forEach((event) => {
    if (event.kind !== 'ingredient_prep' && event.kind !== 'mixing') return;
    const id = event.productionPlanId || 'unlinked-work';
    const order = ensureOrder(id);
    const stage = event.kind === 'ingredient_prep' ? 'prep' : 'production';
    const taskId = event.linkedTaskId || event.id;
    const identity = `${id}:${event.startOn}:${stage}:${event.linkedTaskType}:${taskId}`;
    let day = order.days.find((candidate) => candidate.date === event.startOn);
    if (!day) {
      day = {
        date: event.startOn,
        prep: 0,
        production: 0,
        prepUnknown: false,
        productionUnknown: false,
        resources: [],
      };
      order.days.push(day);
    }
    day.resources = [...new Set([...day.resources, ...(event.assigneeNames ?? [])])];
    if (counted.has(identity)) return;
    counted.add(identity);
    const explicitCount = event.batchCount;
    let count: number | null = null;
    if (typeof explicitCount === 'number' && Number.isFinite(explicitCount) && explicitCount >= 0) {
      count = explicitCount;
    } else if (event.linkedTaskType === 'planned_mixer_batch'
      || event.linkedTaskType === 'planned_spice_preparation') count = 1;
    if (count === null) {
      if (stage === 'prep') day.prepUnknown = true;
      else day.productionUnknown = true;
    } else day[stage] += count;
  });
  pendingPlans.forEach((plan) => ensureOrder(plan.id));
  return [...customers.values()].toSorted((a, b) => a.name.localeCompare(b.name))
    .map((customer) => ({
      ...customer,
      orders: customer.orders.toSorted((a, b) => (
        (a.reference ?? '').localeCompare(b.reference ?? '') || a.key.localeCompare(b.key)
      ))
        .map((order) => ({
          ...order,
          days: order.days.toSorted((a, b) => a.date.localeCompare(b.date)).map((day) => ({
            ...day,
            resources: day.resources.toSorted((a, b) => a.localeCompare(b)),
          })),
        })),
    }));
}
