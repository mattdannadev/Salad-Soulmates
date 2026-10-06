import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { describe, expect, it } from 'vitest';
import DashboardSchedule from '@/components/dashboard-schedule';
import { dashboardScheduleSummary } from '@/services/dashboard-schedule-summary';
import type { DashboardBatchEvent } from '@/services/dashboard-schedule-summary';

const context = {
  id: 'order-one',
  customerName: 'Acme Foods',
  orderReference: 'PO-100',
  pickupOn: '2026-10-09',
  products: [{ id: 'product-one', name: 'Ranch', batchCount: 100 }],
};
function event(id: string, overrides: Partial<DashboardBatchEvent> = {}): DashboardBatchEvent {
  return {
    id,
    startOn: '2026-10-02',
    kind: 'mixing',
    productionPlanId: context.id,
    linkedTaskType: 'planned_mixer_batch',
    linkedTaskId: id,
    customerId: 'customer-one',
    ...overrides,
  };
}

describe('dashboard daily batch summary', () => {
  it('nests orders beneath their customer and aggregates daily preparation and production', () => {
    const summary = dashboardScheduleSummary([
      event('batch-one'), event('batch-two'),
      event('prep-one', { kind: 'ingredient_prep', linkedTaskType: 'planned_spice_preparation' }),
      event('batch-three', { startOn: '2026-10-03', productionPlanId: 'order-two' }),
      event('cleaning', { kind: 'cleaning' }),
    ], [context, { ...context, id: 'order-two', orderReference: 'PO-200' }]);
    expect(summary).toHaveLength(1);
    expect(summary[0]?.orders).toHaveLength(2);
    expect(summary[0]?.orders[0]?.days).toEqual([
      {
        date: '2026-10-02',
        prep: 1,
        production: 2,
        prepUnknown: false,
        productionUnknown: false,
        resources: [],
      },
    ]);
  });

  it('counts the same linked work once per day and does not allocate order quotas to generic shifts', () => {
    const summary = dashboardScheduleSummary([
      event('assignment-one', { linkedTaskId: 'batch-one' }),
      event('assignment-two', { linkedTaskId: 'batch-one' }),
      event('unknown', { linkedTaskType: 'production_plan' }),
    ], [context]);
    expect(summary[0]?.orders[0]?.days[0]).toMatchObject({
      production: 1, productionUnknown: true,
    });
  });

  it('retains all assigned resources while counting duplicate work once', () => {
    const summary = dashboardScheduleSummary([
      event('assignment-one', { linkedTaskId: 'batch-one', assigneeNames: ['Zoe', 'Alex'] }),
      event('assignment-two', { linkedTaskId: 'batch-one', assigneeNames: ['Maria', 'Alex'] }),
      event('prep', { kind: 'ingredient_prep', assigneeNames: ['Alex'] }),
    ], [context]);
    expect(summary[0]?.orders[0]?.days[0]).toMatchObject({
      production: 1, resources: ['Alex', 'Maria', 'Zoe'],
    });
  });

  it('uses explicit quantities and retains unscheduled orders as pending', () => {
    const summary = dashboardScheduleSummary([
      event('prep', { kind: 'ingredient_prep', batchCount: 5 }),
    ], [context], [{ ...context, id: 'order-two', orderReference: 'PO-200' }]);
    expect(summary[0]?.orders[0]?.days[0]?.prep).toBe(5);
    expect(summary[0]?.orders[1]?.days).toEqual([]);
  });

  it('renders full order details separately from the daily prep and production counts', () => {
    const html = renderToStaticMarkup(createElement(DashboardSchedule, {
      events: [event('one', { batchCount: 24, assigneeNames: ['Alex'] }), event('two', { batchCount: 25 })],
      plans: [],
      planContexts: [context],
      scheduleStartOn: '2026-10-02',
      scheduleEndOn: '2026-10-09',
      locale: 'en',
    }));
    expect(html).toContain('Acme Foods');
    expect(html).toContain('Order: PO-100');
    expect(html).toContain('49 batches');
    expect(html).toContain('scope="row"');
    expect(html).toContain('Ranch · 100 batches');
    expect(html).toContain('Order total: 100 batches');
    expect(html).toContain('<th scope="col">Prep</th>');
    expect(html).toContain('<th scope="col">Production</th>');
    expect(html).toContain('<th scope="col">Resources</th>');
    expect(html).toContain('<td>Alex</td>');
    expect(html).not.toContain('staffing gaps');
    expect(html).toContain('href="/app/scheduling?start=2026-10-02&amp;end=2026-10-09"');
  });

  it('sums full-order product quotas without counting preparation and production twice', () => {
    const summary = dashboardScheduleSummary([
      event('mix', { batchCount: 3 }),
      event('prep', { kind: 'ingredient_prep', batchCount: 3 }),
    ], [{
      ...context,
      products: [...context.products, { id: 'product-two', name: 'Italian', batchCount: 20 }],
    }]);
    expect(summary[0]?.orders[0]?.totalBatchCount).toBe(120);
    expect(summary[0]?.orders[0]?.products).toHaveLength(2);
    expect(summary[0]?.orders[0]?.days[0]).toMatchObject({ prep: 3, production: 3 });
  });

  it('renders Spanish order details and preserves unavailable quotas without inventing totals', () => {
    const unknownContext = {
      ...context,
      products: [{ id: 'product-one', name: 'Ranch', batchCount: null }],
    };
    const html = renderToStaticMarkup(createElement(DashboardSchedule, {
      events: [event('one')], plans: [], planContexts: [unknownContext], locale: 'es',
    }));
    expect(html).toContain('Ranch · Cantidad no disponible');
    expect(html).toContain('Total del pedido: Cantidad no disponible');
    expect(html).toContain('1 lote');
    expect(html).toContain('Recursos');
    expect(html).toContain('Sin asignar');
    expect(dashboardScheduleSummary([event('one')], [{ ...context, products: [] }])[0]?.orders[0]?.totalBatchCount).toBeNull();
  });

  it('shows a useful empty state and unknown quantity without false zero totals', () => {
    expect(renderToStaticMarkup(createElement(DashboardSchedule, {
      events: [], plans: [], locale: 'en',
    }))).toContain('No batches scheduled yet');
    expect(renderToStaticMarkup(createElement(DashboardSchedule, {
      events: [event('unknown', { linkedTaskType: 'production_plan' })],
      plans: [],
      planContexts: [context],
      locale: 'en',
    }))).toContain('Batch count unavailable');
  });
});
