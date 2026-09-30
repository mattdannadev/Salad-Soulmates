import { describe, expect, it } from 'vitest';
import { createDashboardWorkQueues } from '@/services/dashboard-work-queues';

const base = {
  today: '2026-09-20',
  canOrders: true,
  canOrderDirectory: true,
  canPurchases: true,
  canCoverage: true,
  openOrders: [
    { id: 'late-order', needed_on: '2026-09-19' },
    { id: 'due-order', needed_on: '2026-09-20' },
    { id: 'future-order', needed_on: '2026-09-21' },
  ],
  purchases: [
    { expected_on: '2026-09-19', status: 'Confirmed', progress: { open: true } },
    { expected_on: '2026-09-21', status: 'Draft' },
    { expected_on: '2026-09-21', status: 'Confirmed', progress: { open: false } },
  ],
  coverage: [{ shortage: 2 }, { shortage: 0 }],
  production: [],
};

describe('dashboard work queues', () => {
  it('derives actionable, canonical queues from authorized records', () => {
    expect(createDashboardWorkQueues(base)).toEqual([
      {
        id: 'pickups-due', count: 2, overdueCount: 1, href: '/app/orders?pickupTo=2026-09-20&sort=pickup-oldest',
      },
      {
        id: 'purchases-unconfirmed', count: 1, overdueCount: 0, href: '/app/purchasing?status=Draft&sort=due-soon',
      },
      {
        id: 'deliveries-unreceived', count: 1, overdueCount: 1, href: '/app/purchasing?delivery=unreceived&sort=due-soon',
      },
      {
        id: 'ingredient-shortages', count: 1, overdueCount: 1, href: '/app?queue=ingredient-shortages#ingredient-demand',
      },
      {
        id: 'planning-readiness', count: 3, overdueCount: 0, href: '/app/orders?status=unplanned&sort=pickup-oldest',
      },
    ]);
  });

  it('does not expose queues when the corresponding records are unavailable', () => {
    expect(createDashboardWorkQueues({
      ...base,
      canOrders: false,
      canOrderDirectory: false,
      canPurchases: false,
      canCoverage: false,
    }))
      .toEqual([]);
  });

  it('does not link to the Orders directory without its complete read contract', () => {
    expect(
      createDashboardWorkQueues({ ...base, canOrderDirectory: false }).map((queue) => queue.id),
    ).toEqual(['purchases-unconfirmed', 'deliveries-unreceived', 'ingredient-shortages']);
  });
});
