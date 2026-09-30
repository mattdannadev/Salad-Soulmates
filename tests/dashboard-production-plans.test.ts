import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DashboardSchedule from '@/components/dashboard-schedule';
import { dashboardProductionPlans } from '@/services/dashboard-production-plans';
import type { CustomerOrder } from '@/domain/customer-orders';
import type { ProductionPlan } from '@/domain/production';

const plan = {
  id: 'order-one',
  start_on: '2026-10-01',
  finish_on: '2026-10-02',
  status: 'Draft',
  revision: 1,
  note: '',
  shortage_reason: '',
  created_at: '',
} satisfies ProductionPlan;
const order: CustomerOrder = {
  id: plan.id,
  customer_id: 'customer-one',
  customer_name: "Jason's Deli",
  needed_on: '2026-10-09',
  reference: '',
  created_at: '',
  products: [],
  items: [
    { product_name: "Leo's Italian", batch_count: 12 },
    { product_name: 'Creamy Ranch', batch_count: 3 },
  ].map((item, index) => ({
    ...item,
    product_id: `product-${index}`,
    customer_product_option_id: null,
    recipe_version_id: `recipe-${index}`,
    version_number: 1,
    batch_gallons: 40,
    packaging_label: 'Case',
    unit_name: 'Case',
    gallons_per_unit: 4,
    unit_price: null,
    currency: 'USD',
    unit_count: item.batch_count * 10,
    line_total: null,
  })),
};

describe('dashboard production plans', () => {
  it('shows the product quotas and actual customer pickup commitment', () => {
    const plans = dashboardProductionPlans([plan], [order], '2026-10-01', '2026-10-08', 6);
    expect(plans[0]).toMatchObject({
      pickupOn: '2026-10-09',
      spansOutsideWindow: false,
      products: [{ name: "Leo's Italian", batchCount: 12 }, { name: 'Creamy Ranch', batchCount: 3 }],
    });
    const html = renderToStaticMarkup(createElement(DashboardSchedule, { events: [], plans, locale: 'en' }));
    expect(html).toContain('12 batches');
    expect(html).toContain('Creamy Ranch');
    expect(html).toContain('3 batches');
    expect(html).toContain('Pickup Oct 9');
    expect(html).toContain('Planned this week');
    expect(html).not.toContain('order-one');
  });

  it('does not mislabel a multiweek order quota as a weekly allocation', () => {
    const plans = dashboardProductionPlans([{ ...plan, finish_on: '2026-10-10' }], [order], '2026-10-01', '2026-10-08', 6);
    const html = renderToStaticMarkup(createElement(DashboardSchedule, { events: [], plans, locale: 'en' }));
    expect(html).toContain('Full-plan quantity · weekly allocation pending');
    expect(html).not.toContain('Planned this week');
  });

  it('uses an exclusive week boundary and excludes cancelled or past plans', () => {
    expect(dashboardProductionPlans([
      {
        ...plan, id: 'next-week', start_on: '2026-10-08', finish_on: '2026-10-09',
      },
      { ...plan, id: 'past', finish_on: '2026-09-30' },
      { ...plan, id: 'cancelled', status: 'Cancelled' },
    ], [], '2026-10-01', '2026-10-08', 6)).toEqual([]);
  });

  it('never substitutes production finish for an unavailable pickup date', () => {
    const plans = dashboardProductionPlans([plan], [], '2026-10-01', '2026-10-08', 6);
    expect(plans[0]?.pickupOn).toBeNull();
    const html = renderToStaticMarkup(createElement(DashboardSchedule, { events: [], plans, locale: 'es' }));
    expect(html).toContain('Recogida sin fecha');
    expect(html).toContain('Productos no disponibles');
  });
});
