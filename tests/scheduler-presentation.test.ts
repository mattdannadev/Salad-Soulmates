import { expect, it } from 'vitest';
import {
  createSchedulerPresentation,
  schedulerAssignmentDates,
} from '@/components/scheduling/scheduler-presentation';
import type { Assignment } from '@/components/scheduling/scheduler';
import {
  schedulerWorkQueueContextTypes, schedulerWorkQueueKinds, schedulerWorkQueueKindSchema,
} from '@/components/scheduling/scheduler-work-queue-options';

it('offers only supported queue kinds and rejects unsupported or tampered selections', () => {
  schedulerWorkQueueKinds.forEach((kind) => {
    expect(schedulerWorkQueueKindSchema.safeParse(kind).success).toBe(true);
    expect(Array.isArray(schedulerWorkQueueContextTypes[kind])).toBe(true);
  });
  expect(schedulerWorkQueueKinds).not.toContain('maintenance');
  expect(schedulerWorkQueueKindSchema.safeParse('maintenance').success).toBe(false);
  expect(schedulerWorkQueueKindSchema.safeParse('unknown').success).toBe(false);
  expect(schedulerWorkQueueContextTypes.maintenance).toEqual(['equipment']);
});

const work: Assignment = {
  id: 'work',
  revision: 1,
  facilityId: 'plant',
  startAt: '2026-09-30T08:00:00.000Z',
  endAt: '2026-10-02T08:00:00.000Z',
  allDay: true,
  timeZone: 'America/Chicago',
  startDate: '2026-09-30',
  endDate: '2026-10-01',
  type: 'mixing',
  requiredWorkerCount: 2,
  employeeIds: ['employee-1', 'employee-2'],
  note: 'Keep cold',
  productionPlanId: null,
  linkedTaskType: null,
  linkedTaskId: null,
  productId: 'product',
  customerId: 'customer',
  locationLabel: 'Line 1',
  availabilityOverrideReason: null,
};
const input = {
  locale: 'en' as const,
  facilityId: 'plant',
  timezone: 'America/Chicago',
  employees: [
    {
      id: 'employee-1',
      name: 'One',
      facilityId: 'plant',
      availableDays: [1, 2],
    },
    {
      id: 'employee-2',
      name: 'Two',
      facilityId: 'plant',
      availableDays: [1, 2],
    },
    {
      id: 'other-employee',
      name: 'Other',
      facilityId: 'other',
      availableDays: [1],
    },
  ],
  assignments: [work],
  publishedAssignments: [work],
  pto: [
    {
      id: 'pto',
      employeeId: 'employee-1',
      startDate: '2026-09-30',
      endDate: '2026-10-01',
      startMinute: 480,
      endMinute: 720,
      privateNote: 'Private medical detail',
      revision: 1,
    },
  ],
  productionBands: [
    {
      id: 'plan',
      label: 'Plan A',
      startDate: '2026-09-30',
      endDate: '2026-10-01',
    },
  ],
  products: [{ id: 'product', name: 'Salad' }],
  customers: [{ id: 'customer', name: 'Buyer' }],
  visibleEmployeeIds: ['employee-2', 'employee-1'],
  selectedTypes: [],
  startDate: '2026-09-28',
  endDate: '2026-10-05',
};

it('creates one all-day event and multiple assignments without changing input dates', () => {
  const output = createSchedulerPresentation(input);
  expect(output.events).toHaveLength(1);
  expect(output.events[0]).toMatchObject({ id: 'work', allDay: true, readOnly: true });
  expect(output.events[0]?.eventColor).toBe('green');
  expect(output.events[0]?.startDate).toEqual(new Date(2026, 8, 30));
  expect(output.events[0]?.endDate).toEqual(new Date(2026, 9, 2));
  expect(output.assignments).toEqual([
    { id: 'work:employee-1', eventId: 'work', resourceId: 'employee-1' },
    { id: 'work:employee-2', eventId: 'work', resourceId: 'employee-2' },
  ]);
  expect(work.endDate).toBe('2026-10-01');
  expect(work.employeeIds).toEqual(['employee-1', 'employee-2']);
});

it('projects customer orders with a pickup milestone and preceding work', () => {
  const output = createSchedulerPresentation({
    ...input,
    perspective: 'order',
    customerOrders: [
      {
        id: 'plan',
        customerId: 'customer',
        customerName: 'Buyer',
        reference: 'PO-100',
        pickupDate: '2026-10-02',
        orderBatchCount: 12,
      },
    ],
    assignments: [{ ...work, productionPlanId: 'plan', plannedBatchCount: 4 }],
  });
  expect(output.perspective).toBe('order');
  expect(output.resources).toEqual([
    { id: 'customer:customer', name: 'Buyer', expanded: true },
    {
      id: 'order:plan',
      name: 'PO-100',
      parentId: 'customer:customer',
      context: 'Salad · 12 batches · Pickup 2026-10-02',
      reference: 'PO-100',
      pickupDate: '2026-10-02',
      batchLabel: '12 batches',
      progressLabel: '0%',
      expanded: true,
    },
    { id: 'order:plan:area:preparation', name: 'Preparation', parentId: 'order:plan' },
    { id: 'order:plan:area:production', name: 'Production', parentId: 'order:plan' },
    { id: 'order:plan:area:packaging', name: 'Packaging', parentId: 'order:plan' },
    { id: 'order:plan:area:shipping', name: 'Shipping', parentId: 'order:plan' },
  ]);
  expect(output.events.map((event) => event.id)).toEqual(['pickup:plan', 'work']);
  expect(output.events[0]).toMatchObject({
    pickup: true,
    locked: true,
    allDay: true,
    batchCount: 12,
    assignedResources: [],
  });
  expect(output.events[0]?.eventColor).toBe('blue');
  expect(output.events[1]).toMatchObject({
    id: 'work',
    batchCount: 4,
    assignedResources: ['One', 'Two'],
  });
  expect(output.assignments).toEqual([
    {
      id: 'pickup:plan:order:plan:area:shipping',
      eventId: 'pickup:plan',
      resourceId: 'order:plan:area:shipping',
    },
    {
      id: 'work:order:plan:area:production',
      eventId: 'work',
      resourceId: 'order:plan:area:production',
    },
  ]);
  expect(output.dependencies).toEqual([
    {
      id: 'order:plan:work:pickup:plan',
      from: 'work',
      to: 'pickup:plan',
      type: 2,
    },
  ]);
  expect(output.resourceTimeRanges).toEqual([]);
});

it('filters the production plan to the selected order and its work', () => {
  const output = createSchedulerPresentation({
    ...input,
    perspective: 'order',
    selectedOrderId: 'order-a',
    customerOrders: [
      {
        id: 'order-a',
        customerId: 'customer',
        customerName: 'Buyer',
        reference: 'PO-A',
        pickupDate: '2026-10-02',
      },
      {
        id: 'order-b',
        customerId: 'customer',
        customerName: 'Buyer',
        reference: 'PO-B',
        pickupDate: '2026-10-02',
      },
    ],
    assignments: [
      { ...work, id: 'work-a', productionPlanId: 'order-a' },
      { ...work, id: 'work-b', productionPlanId: 'order-b' },
    ],
    supplierDeliveries: [
      {
        id: 'delivery',
        supplierName: 'North Farm',
        reference: 'PO-42',
        expectedDate: '2026-10-01',
        note: '',
        lines: [],
      },
    ],
  });
  expect(output.resources.map((resource) => resource.id)).toContain('order:order-a');
  expect(output.resources.map((resource) => resource.id)).not.toContain('order:order-b');
  expect(output.events.map((event) => event.id)).toEqual(['pickup:order-a', 'work-a']);
  expect(output.assignments).toContainEqual({
    id: 'work-a:order:order-a:area:production',
    eventId: 'work-a',
    resourceId: 'order:order-a:area:production',
  });
});

it('projects every operational work type onto plant capability lanes', () => {
  const output = createSchedulerPresentation({
    ...input,
    perspective: 'operations',
    assignments: [
      work,
      { ...work, id: 'pack', type: 'packaging' },
      { ...work, id: 'receive', type: 'receiving' },
      { ...work, id: 'load', type: 'shipment_loading' },
      { ...work, id: 'prep', type: 'ingredient_prep' },
      { ...work, id: 'clean', type: 'cleaning' },
    ],
  });
  expect(output.resources.map((resource) => resource.id)).toEqual([
    'mixer',
    'holding-tank',
    'packaging-line',
    'ingredient-prep',
    'receiving-shipping',
    'operations',
  ]);
  expect(output.assignments).toEqual([
    { id: 'work:mixer', eventId: 'work', resourceId: 'mixer' },
    { id: 'work:holding-tank', eventId: 'work', resourceId: 'holding-tank' },
    { id: 'pack:packaging-line', eventId: 'pack', resourceId: 'packaging-line' },
    { id: 'pack:holding-tank', eventId: 'pack', resourceId: 'holding-tank' },
    { id: 'receive:receiving-shipping', eventId: 'receive', resourceId: 'receiving-shipping' },
    { id: 'load:receiving-shipping', eventId: 'load', resourceId: 'receiving-shipping' },
    { id: 'prep:ingredient-prep', eventId: 'prep', resourceId: 'ingredient-prep' },
    { id: 'clean:operations', eventId: 'clean', resourceId: 'operations' },
  ]);
});

it('projects open supplier deliveries as locked all-day receiving events', () => {
  const output = createSchedulerPresentation({
    ...input,
    supplierDeliveries: [
      {
        id: 'delivery',
        supplierName: 'North Farm',
        reference: 'PO-42',
        expectedDate: '2026-10-01',
        note: 'Dock 2',
        lines: [{ ingredientName: 'Oil', quantity: 55, uom: 'gal' }],
      },
    ],
  });
  expect(output.events.find((event) => event.id === 'delivery:delivery')).toMatchObject({
    name: 'Supplier delivery · North Farm · PO-42',
    allDay: true,
    locked: true,
    delivery: true,
    workType: 'receiving',
    eventColor: 'purple',
  });
});

it('maps native event colors from staffing coverage', () => {
  const output = createSchedulerPresentation({
    ...input,
    assignments: [
      { ...work, id: 'none', employeeIds: [] },
      { ...work, id: 'partial', employeeIds: ['employee-1'] },
      { ...work, id: 'complete' },
    ],
  });
  expect(output.events.map(({ id, eventColor }) => [id, eventColor])).toEqual([
    ['none', 'red'],
    ['partial', 'yellow'],
    ['complete', 'green'],
  ]);
});

it('uses calendar arithmetic across DST and year boundaries', () => {
  const output = createSchedulerPresentation({
    ...input,
    startDate: '2026-10-30',
    endDate: '2027-01-03',
    assignments: [
      {
        ...work,
        id: 'dst',
        startDate: '2026-11-01',
        endDate: '2026-11-01',
      },
      {
        ...work,
        id: 'year',
        startDate: '2026-12-31',
        endDate: '2026-12-31',
      },
    ],
  });
  expect(output.events[0]?.endDate).toEqual(new Date(2026, 10, 2));
  expect(output.events[1]?.endDate).toEqual(new Date(2027, 0, 1));
});

it('localizes task and publication labels while preserving owner-entered context', () => {
  const output = createSchedulerPresentation({ ...input, locale: 'es' });
  expect(output.events[0]).toMatchObject({
    name: 'Mezcla · Salad',
    publicationState: 'published',
    publicationLabel: 'Publicado',
  });
  const changed = createSchedulerPresentation({
    ...input,
    locale: 'es',
    assignments: [{ ...work, note: 'Changed' }],
  });
  expect(changed.events[0]).toMatchObject({
    publicationState: 'draft',
    publicationLabel: 'Borrador',
  });
});

it('preserves displayed resource order and filters plant, employee, work type and range', () => {
  const output = createSchedulerPresentation({
    ...input,
    visibleEmployeeIds: ['other-employee', 'employee-2', 'employee-2'],
    selectedTypes: ['mixing'],
    assignments: [
      work,
      { ...work, id: 'foreign', facilityId: 'other' },
      { ...work, id: 'type', type: 'cleaning' },
      {
        ...work,
        id: 'outside',
        startDate: '2026-10-05',
        endDate: '2026-10-05',
      },
      { ...work, id: 'hidden', employeeIds: ['employee-1'] },
    ],
  });
  expect(output.resources.map((resource) => resource.id)).toEqual(['unassigned', 'employee-2']);
  expect(output.events.map((event) => event.id)).toEqual(['work']);
  expect(output.assignments.map((assignment) => assignment.resourceId)).toEqual(['employee-2']);
  expect(output.resourceTimeRanges).toEqual([]);
});

it('shows unassigned work without inventing an employee assignment', () => {
  const output = createSchedulerPresentation({
    ...input,
    visibleEmployeeIds: [],
    assignments: [{ ...work, employeeIds: [] }],
  });
  expect(output.assignments).toEqual([
    { id: 'work:unassigned', eventId: 'work', resourceId: 'unassigned' },
  ]);
});

it('retains future work and commitments for native calendar navigation with customer/order context', () => {
  const output = createSchedulerPresentation({
    ...input,
    perspective: 'order',
    includeOutsideWindow: true,
    customerOrders: [
      {
        id: 'future-order',
        customerId: 'customer',
        customerName: 'Buyer',
        reference: 'PO-FUTURE',
        pickupDate: '2026-11-06',
      },
    ],
    assignments: [
      {
        ...work,
        id: 'future-work',
        productionPlanId: 'future-order',
        startDate: '2026-11-04',
        endDate: '2026-11-04',
      },
      { ...work, id: 'foreign', facilityId: 'other' },
    ],
    supplierDeliveries: [
      {
        id: 'future-delivery',
        supplierName: 'Farm',
        reference: 'SUP-1',
        expectedDate: '2026-11-03',
        note: '',
        lines: [],
      },
    ],
  });
  expect(output.events.map((event) => event.id)).toEqual([
    'pickup:future-order',
    'delivery:future-delivery',
    'future-work',
  ]);
  expect(output.events.find((event) => event.id === 'future-work')).toMatchObject({
    name: 'Mixing · Salad',
    calendarName: 'Mixing · Keep cold · Salad · Buyer · PO-FUTURE · Line 1',
    calendarTitle: 'Mixing',
    calendarContext: ['PO-FUTURE', 'Salad', 'Buyer', 'Line 1'],
    orderReference: 'PO-FUTURE',
    allDay: true,
  });
  expect(output.events.find((event) => event.id === 'pickup:future-order')).toMatchObject({
    calendarTitle: 'Pickup',
    calendarContext: ['PO-FUTURE', 'Buyer'],
    orderReference: 'PO-FUTURE',
  });
  expect(output.events.find((event) => event.id === 'future-work')?.orderAccent)
    .toMatch(/^order-accent-[0-7]$/);
  expect(output.events.find((event) => event.id === 'pickup:future-order')?.orderAccent)
    .toMatch(/^order-accent-[0-7]$/);
  expect(output.events.find((event) => event.id === 'delivery:future-delivery')).toMatchObject({
    calendarTitle: 'Supplier delivery',
    calendarContext: ['SUP-1', 'Farm'],
  });
  expect(output.assignments).toContainEqual({
    id: 'future-work:order:future-order:area:production',
    eventId: 'future-work',
    resourceId: 'order:future-order:area:production',
  });
});

it('maps production context and preserves protected facility PTO hours without private notes', () => {
  const output = createSchedulerPresentation(input);
  expect(output.timeRanges).toEqual([
    {
      id: 'production:plan',
      name: 'Plan A',
      startDate: new Date(2026, 8, 30),
      endDate: new Date(2026, 9, 2),
      readOnly: true,
    },
  ]);
  expect(output.resourceTimeRanges).toEqual([
    {
      id: 'pto:pto',
      resourceId: 'employee-1',
      name: 'Time off scheduled',
      startDate: '2026-09-30',
      endDate: '2026-10-01',
      startMinute: 480,
      endMinute: 720,
      timezone: 'America/Chicago',
      readOnly: true,
    },
  ]);
  expect(JSON.stringify(output)).not.toContain('Private medical detail');
  expect(JSON.stringify(output)).not.toContain('privateNote');
});

it('preserves full-day PTO midnight minutes and includes work already in progress', () => {
  const output = createSchedulerPresentation({
    ...input,
    startDate: '2026-10-01',
    endDate: '2026-10-02',
    pto: [
      {
        ...input.pto[0],
        id: 'day',
        employeeId: 'employee-1',
        startDate: '2026-10-01',
        endDate: '2026-10-01',
        startMinute: 0,
        endMinute: 1440,
        privateNote: '',
        revision: 1,
      },
    ],
  });
  expect(output.events).toHaveLength(1);
  expect(output.resourceTimeRanges[0]).toMatchObject({
    endDate: '2026-10-01',
    startMinute: 0,
    endMinute: 1440,
    timezone: 'America/Chicago',
  });
});

it.each(['en', 'es'] as const)('preserves existing off task label parity in %s', (locale) => {
  const output = createSchedulerPresentation({
    ...input,
    locale,
    assignments: [
      {
        ...work,
        type: 'off',
        note: null,
        productId: null,
        customerId: null,
        locationLabel: null,
      },
    ],
  });
  expect(output.events[0]?.name).toBe(locale === 'es' ? 'Libre / PTO' : 'Off / PTO');
});

it('preserves facility PTO wall times across a DST gap without browser-timezone conversion', () => {
  const output = createSchedulerPresentation({
    ...input,
    timezone: 'America/Los_Angeles',
    startDate: '2026-03-08',
    endDate: '2026-03-09',
    pto: [
      {
        id: 'dst',
        employeeId: 'employee-1',
        startDate: '2026-03-08',
        endDate: '2026-03-08',
        startMinute: 150,
        endMinute: 210,
        privateNote: 'Private',
        revision: 1,
      },
    ],
  });
  expect(output.timezone).toBe('America/Los_Angeles');
  expect(output.resourceTimeRanges).toEqual([
    {
      id: 'pto:dst',
      resourceId: 'employee-1',
      name: 'Time off scheduled',
      startDate: '2026-03-08',
      endDate: '2026-03-08',
      startMinute: 150,
      endMinute: 210,
      timezone: 'America/Los_Angeles',
      readOnly: true,
    },
  ]);
  expect(() => createSchedulerPresentation({ ...input, timezone: 'Not/A-Timezone' })).toThrow();
});

it('rejects invalid display dates, reversed ranges and invalid PTO minutes', () => {
  expect(() => createSchedulerPresentation({ ...input, startDate: '2026-02-30' })).toThrow();
  expect(() => createSchedulerPresentation({ ...input, endDate: input.startDate })).toThrow();
  expect(() => createSchedulerPresentation({
    ...input,
    assignments: [{ ...work, endDate: '2026-09-29' }],
  })).toThrow();
  expect(() => createSchedulerPresentation({
    ...input,
    pto: [
      {
        ...input.pto[0],
        id: 'invalid',
        employeeId: 'employee-1',
        startDate: '2026-09-30',
        endDate: '2026-09-30',
        startMinute: 720,
        endMinute: 480,
        privateNote: '',
        revision: 1,
      },
    ],
  })).toThrow();
});

it('round-trips all-day gesture proposals through inclusive editor dates and exclusive ends', () => {
  const dates = schedulerAssignmentDates(new Date(2026, 10, 1), new Date(2026, 10, 3));
  expect(dates).toEqual({ startDate: '2026-11-01', endDate: '2026-11-02' });
  const output = createSchedulerPresentation({
    ...input,
    startDate: '2026-10-30',
    endDate: '2026-11-05',
    assignments: [{ ...work, ...dates }],
  });
  expect(output.events[0]?.startDate).toEqual(new Date(2026, 10, 1));
  expect(output.events[0]?.endDate).toEqual(new Date(2026, 10, 3));
  expect(output.assignments).toHaveLength(2);
  expect(schedulerAssignmentDates(new Date(2026, 11, 31), new Date(2027, 0, 1))).toEqual({
    startDate: '2026-12-31',
    endDate: '2026-12-31',
  });
});

it('rejects partial-day, invalid and reversed gesture proposals instead of persisting timed work', () => {
  expect(() => schedulerAssignmentDates(new Date(2026, 8, 30, 12), new Date(2026, 9, 1))).toThrow(
    'Invalid scheduler all-day proposal.',
  );
  expect(() => schedulerAssignmentDates(new Date(2026, 8, 30), new Date(2026, 9, 1, 12))).toThrow(
    'Invalid scheduler all-day proposal.',
  );
  expect(() => schedulerAssignmentDates(new Date('invalid'), new Date(2026, 9, 1))).toThrow(
    'Invalid scheduler all-day proposal.',
  );
  expect(() => schedulerAssignmentDates(new Date(2026, 9, 1), new Date(2026, 8, 30))).toThrow(
    'Invalid scheduler all-day proposal.',
  );
  expect(() => schedulerAssignmentDates(new Date(2026, 9, 1), new Date(2026, 9, 1))).toThrow(
    'Invalid scheduler all-day proposal.',
  );
});
