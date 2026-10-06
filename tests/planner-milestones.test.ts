import { expect, it } from 'vitest';
import { createSchedulerPresentation } from '@/components/scheduling/scheduler-presentation';

const order = {
  id: 'order',
  customerId: 'customer',
  customerName: 'Buyer',
  reference: 'PO-1',
  pickupDate: '2026-10-02',
  receivedDate: '2026-09-30',
  productionCompleteDate: '2026-10-01',
};

const input = {
  locale: 'en' as const,
  facilityId: 'plant',
  timezone: 'America/Chicago',
  employees: [],
  assignments: [],
  publishedAssignments: [],
  pto: [],
  productionBands: [],
  products: [],
  customers: [],
  visibleEmployeeIds: [],
  selectedTypes: [],
  perspective: 'order' as const,
  startDate: '2026-09-28',
  endDate: '2026-10-05',
  customerOrders: [order],
};

it('exposes named order milestones using their actual source dates', () => {
  const output = createSchedulerPresentation(input);
  expect(output.milestones).toEqual([
    {
      id: 'milestone:order_received:order',
      orderId: 'order',
      name: 'Order received',
      kind: 'order_received',
      date: new Date(2026, 8, 30),
    },
    {
      id: 'milestone:production_complete:order',
      orderId: 'order',
      name: 'Production complete',
      kind: 'production_complete',
      date: new Date(2026, 9, 1),
    },
  ]);
  expect(output.events[0]).toMatchObject({ pickup: true, startDate: new Date(2026, 9, 2) });
});

it('omits missing, invalid and out-of-horizon milestone dates', () => {
  expect(createSchedulerPresentation({
    ...input,
    customerOrders: [{
      ...order, receivedDate: undefined, productionCompleteDate: '2026-02-30',
    }],
  }).milestones).toEqual([]);
  expect(createSchedulerPresentation({
    ...input,
    customerOrders: [{
      ...order, receivedDate: '2026-09-27', productionCompleteDate: '2026-10-05',
    }],
  }).milestones).toEqual([]);
});

it('does not add planner anchors to other projections', () => {
  expect(createSchedulerPresentation({ ...input, perspective: 'employee' }).milestones).toEqual([]);
});
