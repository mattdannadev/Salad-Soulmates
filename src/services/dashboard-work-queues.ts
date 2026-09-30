export type DashboardWorkQueueId =
  | 'pickups-due'
  | 'purchases-unconfirmed'
  | 'deliveries-unreceived'
  | 'ingredient-shortages'
  | 'planning-readiness';

export type DashboardWorkQueue = {
  id: DashboardWorkQueueId;
  count: number;
  overdueCount: number;
  href: string;
};

type DatedRecord = { id: string; needed_on: string };
type PurchaseRecord = { expected_on: string; status: string; progress?: { open: boolean } };
type CoverageRecord = { shortage: number };
type ProductionRecord = { id: string; status: string };

export type DashboardWorkQueueInput = {
  today: string;
  canOrders: boolean;
  canOrderDirectory: boolean;
  canPurchases: boolean;
  canCoverage: boolean;
  openOrders: readonly DatedRecord[];
  purchases: readonly PurchaseRecord[];
  coverage: readonly CoverageRecord[];
  production: readonly ProductionRecord[];
};

/**
 * Computes permission-scoped queue counts and canonical directory URLs.
 * Callers must supply only records already authorized for the current user.
 */
export function createDashboardWorkQueues({
  today,
  canOrders,
  canOrderDirectory,
  canPurchases,
  canCoverage,
  openOrders,
  purchases,
  coverage,
  production,
}: DashboardWorkQueueInput): DashboardWorkQueue[] {
  const queues: DashboardWorkQueue[] = [];
  const duePickups = openOrders.filter((order) => order.needed_on <= today);
  const overduePickups = duePickups.filter((order) => order.needed_on < today);
  const unconfirmedPurchases = purchases.filter((purchase) => purchase.status === 'Draft');
  const unreceivedDeliveries = purchases.filter(
    (purchase) => purchase.status === 'Confirmed' && purchase.progress?.open,
  );
  const shortages = coverage.filter((line) => line.shortage > 0);
  const ordersWithoutProductionPlan = openOrders.filter(
    (order) => !production.some((plan) => plan.id === order.id && plan.status !== 'Cancelled'),
  );

  if (canOrderDirectory && duePickups.length) {
    queues.push({
      id: 'pickups-due',
      count: duePickups.length,
      overdueCount: overduePickups.length,
      href: `/app/orders?pickupTo=${today}&sort=pickup-oldest`,
    });
  }
  if (canPurchases && unconfirmedPurchases.length) {
    queues.push({
      id: 'purchases-unconfirmed',
      count: unconfirmedPurchases.length,
      overdueCount: 0,
      href: '/app/purchasing?status=Draft&sort=due-soon',
    });
  }
  if (canPurchases && unreceivedDeliveries.length) {
    queues.push({
      id: 'deliveries-unreceived',
      count: unreceivedDeliveries.length,
      overdueCount: unreceivedDeliveries.filter((purchase) => purchase.expected_on < today).length,
      href: '/app/purchasing?delivery=unreceived&sort=due-soon',
    });
  }
  if (canCoverage && shortages.length) {
    queues.push({
      id: 'ingredient-shortages',
      count: shortages.length,
      overdueCount: shortages.length,
      href: '/app?queue=ingredient-shortages#ingredient-demand',
    });
  }
  if (canOrderDirectory && ordersWithoutProductionPlan.length) {
    queues.push({
      id: 'planning-readiness',
      count: ordersWithoutProductionPlan.length,
      overdueCount: 0,
      href: '/app/orders?status=unplanned&sort=pickup-oldest',
    });
  }
  return queues;
}
