import { describe, expect, it } from 'vitest';
import { dashboardProductionPlans, dashboardScheduleOrderContexts } from '@/services/dashboard-production-plans';
import type { CustomerOrder } from '@/domain/customer-orders';
import type { ProductionPlan } from '@/domain/production';

const plan: ProductionPlan = {
  id: 'order-one',
  start_on: '2026-10-01',
  finish_on: '2026-10-02',
  status: 'Draft',
  revision: 1,
  note: '',
  shortage_reason: '',
  created_at: '',
};
const order: CustomerOrder = {
  id: plan.id,
  customer_id: 'customer-one',
  customer_name: "Jason's Deli",
  needed_on: '2026-10-09',
  reference: '',
  created_at: '',
  products: [],
  items: [{
    product_name: "Leo's Italian",
    batch_count: 12,
    product_id: 'product-0',
    customer_product_option_id: null,
    recipe_version_id: 'recipe-0',
    version_number: 1,
    batch_gallons: 40,
    packaging_label: 'Case',
    unit_name: 'Case',
    gallons_per_unit: 4,
    unit_price: null,
    currency: 'USD',
    unit_count: 120,
    line_total: null,
  }],
};

describe('dashboard production plan context', () => {
  it('retains full-order quotas and actual pickup dates without allocating them to individual days', () => {
    expect(dashboardProductionPlans([plan], [order], '2026-10-01', '2026-10-08', 6)[0]).toMatchObject({
      orderReference: null,
      pickupOn: '2026-10-09',
      spansOutsideWindow: false,
      products: [{ id: 'product-0', name: "Leo's Italian", batchCount: 12 }],
    });
    expect(dashboardProductionPlans([{ ...plan, finish_on: '2026-10-10' }], [order], '2026-10-01', '2026-10-08', 6)[0]?.spansOutsideWindow).toBe(true);
    expect(dashboardProductionPlans([plan], [], '2026-10-01', '2026-10-08', 6)[0]?.pickupOn).toBeNull();
  });

  it('builds workforce-authorized context without inventing batch quantities', () => {
    expect(dashboardScheduleOrderContexts(
      [{
        id: plan.id, customerName: "Jason's Deli", orderReference: 'PO-100', pickupOn: '2026-10-09',
      }],
      [{ id: 'product-0', name: "Leo's Italian" }],
      [{ productionPlanId: plan.id, productId: 'product-0' }],
    )[0]).toMatchObject({
      customerName: "Jason's Deli",
      orderReference: 'PO-100',
      products: [{ id: 'product-0', name: "Leo's Italian", batchCount: null }],
    });
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
});
