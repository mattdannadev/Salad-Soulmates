import { matchesPublishedWork, scheduleKindLabel } from '@/domain/scheduling';
import type { PublishedWorkComparison } from '@/domain/scheduling';
import type {
  Assignment,
  CustomerOrder,
  Employee,
  ProductionBand,
  PtoBlock,
  SupplierDelivery,
  WorkType,
} from './scheduler';

const UNASSIGNED_RESOURCE_ID = 'unassigned';
const MINUTES_PER_DAY = 1440;
const HASH_MODULUS = 2 ** 32;

const operationResourcesByWorkType: Record<WorkType, string[]> = {
  mixing: ['mixer', 'holding-tank'],
  packaging: ['packaging-line', 'holding-tank'],
  receiving: ['receiving-shipping'],
  shipment_loading: ['receiving-shipping'],
  ingredient_prep: ['ingredient-prep'],
  pre_op: ['operations'],
  post_op: ['operations'],
  cleaning: ['operations'],
  other: ['operations'],
  off: ['operations'],
};

type WorkflowArea = 'preparation' | 'production' | 'packaging' | 'shipping';

const workflowAreas: { id: WorkflowArea; en: string; es: string }[] = [
  { id: 'preparation', en: 'Preparation', es: 'Preparación' },
  { id: 'production', en: 'Production', es: 'Producción' },
  { id: 'packaging', en: 'Packaging', es: 'Empaque' },
  { id: 'shipping', en: 'Shipping', es: 'Envío' },
];

function workflowAreaForWork(type: WorkType): WorkflowArea | null {
  if (type === 'ingredient_prep' || type === 'receiving') return 'preparation';
  if (type === 'pre_op' || type === 'mixing' || type === 'post_op' || type === 'cleaning') return 'production';
  if (type === 'packaging') return 'packaging';
  if (type === 'shipment_loading') return 'shipping';
  return null;
}

function workflowStep(type: WorkType, pickup = false) {
  if (pickup) return 70;
  if (type === 'ingredient_prep' || type === 'receiving') return 10;
  if (type === 'pre_op') return 20;
  if (type === 'mixing') return 30;
  if (type === 'post_op' || type === 'cleaning') return 40;
  if (type === 'packaging') return 50;
  if (type === 'shipment_loading') return 60;
  return 99;
}

function workflowResourceId(orderId: string, area: WorkflowArea) {
  return `order:${orderId}:area:${area}`;
}

function staffingEventColor(assignedCount: number, requiredCount: number) {
  if (assignedCount === 0) return 'red' as const;
  if (assignedCount < requiredCount) return 'yellow' as const;
  return 'green' as const;
}

/** Produce a repeatable visual accent without storing presentation state. */
function orderAccent(orderId: string): string {
  let hash = 0;
  for (let index = 0; index < orderId.length; index += 1) {
    hash = (hash * 31 + orderId.charCodeAt(index)) % HASH_MODULUS;
  }
  return `order-accent-${hash % 8}`;
}

export interface SchedulerResource {
  id: string;
  name: string;
  /** Supplemental order identity displayed alongside a concise PO reference. */
  context?: string;
  reference?: string;
  pickupDate?: string;
  batchLabel?: string;
  progressLabel?: string;
  parentId?: string;
  expanded?: boolean;
}

/** The planning board can be read by operational capacity, people, or demand. */
export type SchedulerPerspective = 'operations' | 'employee' | 'order';
export type SchedulerStaffingFilter = 'all' | 'assigned' | 'unassigned';
export type SchedulerWorkStatusFilter = 'all' | 'open' | 'completed';
export type SchedulerPublicationFilter = 'all' | 'draft' | 'published';

export interface SchedulerPresentationEvent {
  id: string;
  name: string;
  /** Standalone calendar label including customer/order context. */
  calendarName?: string;
  /** Structured calendar card content; full notes stay in calendarName. */
  calendarTitle?: string;
  calendarContext?: string[];
  /** Stable order identity and accent class used by the execution calendar. */
  orderReference?: string;
  orderAccent?: string;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  readOnly: true;
  workType: WorkType;
  /** Internal cycle matching key; only prep/mixing expose this as a UI batch count. */
  cycleBatchCount?: number;
  batchCount?: number;
  assignedResources: string[];
  publicationState: 'draft' | 'published';
  publicationLabel: string;
  eventColor: 'blue' | 'green' | 'purple' | 'red' | 'yellow';
  locked?: boolean;
  pickup?: boolean;
  delivery?: boolean;
}

export interface SchedulerPresentationAssignment {
  id: string;
  eventId: string;
  resourceId: string;
}

export interface SchedulerPresentationDependency {
  id: string;
  from: string;
  to: string;
  type: 2;
}

export interface SchedulerPresentationRange {
  id: string;
  name: string;
  startDate: Date;
  endDate: Date;
  readOnly: true;
}

/** Daily PTO wall-clock hours across an inclusive facility calendar-date span. */
export interface SchedulerPtoRange {
  id: string;
  name: string;
  resourceId: string;
  startDate: string;
  endDate: string;
  startMinute: number;
  endMinute: number;
  timezone: string;
  readOnly: true;
}

export interface SchedulerPresentationData {
  perspective: SchedulerPerspective;
  timezone: string;
  resources: SchedulerResource[];
  events: SchedulerPresentationEvent[];
  assignments: SchedulerPresentationAssignment[];
  dependencies: SchedulerPresentationDependency[];
  timeRanges: SchedulerPresentationRange[];
  resourceTimeRanges: SchedulerPtoRange[];
  milestones?: SchedulerOrderMilestone[];
}

export interface SchedulerOrderMilestone {
  id: string;
  orderId: string;
  name: string;
  kind: 'order_received' | 'production_complete';
  date: Date;
}

interface PresentationInput {
  locale: 'en' | 'es';
  facilityId: string;
  timezone: string;
  employees: Employee[];
  assignments: Assignment[];
  publishedAssignments: PublishedWorkComparison[];
  pto: PtoBlock[];
  /** Already authorized and scoped to the selected facility by the caller. */
  productionBands: ProductionBand[];
  products: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  customerOrders?: CustomerOrder[];
  supplierDeliveries?: SupplierDelivery[];
  /** Ordered employee IDs after the existing search, selection and utilization sort. */
  visibleEmployeeIds: string[];
  /** Explicit calendar filters; an empty array means no employee filter. */
  selectedEmployeeIds?: string[];
  selectedCustomerId?: string | null;
  selectedOrderId?: string | null;
  selectedTypes: WorkType[];
  staffingFilter?: SchedulerStaffingFilter;
  workStatusFilter?: SchedulerWorkStatusFilter;
  publicationFilter?: SchedulerPublicationFilter;
  perspective?: SchedulerPerspective;
  startDate: string;
  /** Exclusive display-window end, unlike assignment and production-band ends. */
  endDate: string;
  /** Native widgets navigate without fetching a new route window. */
  includeOutsideWindow?: boolean;
}

/** Interpret calendar dates as local wall time; never parse YYYY-MM-DD as UTC. */
function calendarDate(value: string, dayOffset = 0): Date {
  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) throw new Error('Invalid scheduler calendar date.');
  const year = Number(value.slice(0, 4));
  const month = Number(value.slice(5, 7));
  const day = Number(value.slice(8, 10));
  const date = new Date(0);
  date.setFullYear(year, month - 1, day);
  date.setHours(0, 0, 0, 0);
  if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) {
    throw new Error('Invalid scheduler calendar date.');
  }
  date.setDate(date.getDate() + dayOffset);
  return date;
}

/** Convert a vendor all-day wall-clock proposal to the editor's inclusive dates. */
export function schedulerAssignmentDates(
  startDate: Date,
  endDate: Date,
): {
  startDate: string;
  endDate: string;
} {
  const dateKey = (date: Date) => {
    if (
      !(date instanceof Date)
      || !Number.isFinite(date.getTime())
      || date.getHours() !== 0
      || date.getMinutes() !== 0
      || date.getSeconds() !== 0
      || date.getMilliseconds() !== 0
    ) {
      throw new Error('Invalid scheduler all-day proposal.');
    }
    return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
  };
  const start = dateKey(startDate);
  const endExclusive = dateKey(endDate);
  if (endExclusive <= start) throw new Error('Invalid scheduler all-day proposal.');
  return { startDate: start, endDate: dateKey(calendarDate(endExclusive, -1)) };
}

/**
 * Prepare read-only store data without importing a vendor or persisting changes.
 * Inputs are validated server-backed presentation contracts. Date objects encode
 * all-day calendar wall time for a future widget; they are not persisted instants.
 * Timed PTO retains facility dates, minutes and timezone. The licensed widget
 * integration must convert these with its verified timezone/DST handling, never
 * with browser-local Date constructors.
 * Raw labels must be rendered as text or escaped by the eventual vendor renderer.
 */
export function createSchedulerPresentation(input: PresentationInput): SchedulerPresentationData {
  // Invalid IANA timezone identifiers fail before preparing any widget data.
  new Intl.DateTimeFormat('en', { timeZone: input.timezone }).resolvedOptions();
  const windowStart = calendarDate(input.startDate);
  const windowEnd = calendarDate(input.endDate);
  if (windowEnd <= windowStart) throw new Error('Invalid scheduler display range.');
  const employeesById = new Map(
    input.employees
      .filter((employee) => employee.facilityId === input.facilityId)
      .map((employee) => [employee.id, employee]),
  );
  const visibleEmployees = [...new Set(input.visibleEmployeeIds)].flatMap((id) => {
    const employee = employeesById.get(id);
    return employee ? [employee] : [];
  });
  const visibleIds = new Set(visibleEmployees.map((employee) => employee.id));
  const quantityFormatter = new Intl.NumberFormat(input.locale === 'es' ? 'es' : 'en-US', {
    maximumFractionDigits: 2,
  });
  const products = new Map(input.products.map((product) => [product.id, product.name]));
  const customers = new Map(input.customers.map((customer) => [customer.id, customer.name]));
  const perspective = input.perspective ?? 'employee';
  const events: SchedulerPresentationEvent[] = [];
  const assignments: SchedulerPresentationAssignment[] = [];
  const dependencies: SchedulerPresentationDependency[] = [];
  const customerOrders = input.customerOrders ?? [];
  const supplierDeliveries = input.supplierDeliveries ?? [];
  const ordersById = new Map(customerOrders.map((order) => [order.id, order]));
  const visibleOrders = customerOrders
    .filter((order) => !input.selectedCustomerId || order.customerId === input.selectedCustomerId)
    .filter((order) => !input.selectedOrderId || order.id === input.selectedOrderId)
    .toSorted(
      (left, right) => left.customerName.localeCompare(right.customerName)
        || left.reference.localeCompare(right.reference),
    );
  const resolveOrderId = (item: Assignment) => {
    const directOrderId = item.linkedTaskType === 'order' ? item.linkedTaskId : item.productionPlanId;
    if (directOrderId && ordersById.has(directOrderId)) return directOrderId;
    // A customer-only work order is safe to place when there is exactly one
    // visible order for that customer. Ambiguous work stays visibly unlinked.
    const matches = item.customerId
      ? visibleOrders.filter((order) => order.customerId === item.customerId)
      : [];
    return matches.length === 1 ? (matches[0]?.id ?? null) : null;
  };
  const orderResources: SchedulerResource[] = [];
  const customerResourceIds = new Set<string>();
  visibleOrders.forEach((order) => {
    const customerResourceId = `customer:${order.customerId}`;
    if (!customerResourceIds.has(customerResourceId)) {
      customerResourceIds.add(customerResourceId);
      orderResources.push({ id: customerResourceId, name: order.customerName, expanded: true });
    }
    const orderWork = input.assignments.filter((item) => resolveOrderId(item) === order.id);
    const productNames = [
      ...new Set(
        orderWork
          .flatMap((item) => (item.productId ? [products.get(item.productId) ?? ''] : []))
          .filter(Boolean),
      ),
    ];
    const scheduledBatches = orderWork
      .filter((item) => item.type === 'mixing')
      .reduce((total, item) => total + (item.plannedBatchCount ?? 0), 0);
    const completedBatches = orderWork
      .filter((item) => item.type === 'mixing' && item.completed)
      .reduce((total, item) => total + (item.plannedBatchCount ?? 0), 0);
    const orderedBatches = order.orderBatchCount ?? scheduledBatches;
    const caseCount = order.caseCount ?? 0;
    const batchLabel = orderedBatches
      ? `${quantityFormatter.format(orderedBatches)} ${input.locale === 'es' ? 'lotes' : 'batches'}${
        caseCount
          ? ` (${quantityFormatter.format(caseCount)} ${input.locale === 'es' ? 'cajas' : 'cases'})`
          : ''
      }`
      : undefined;
    const progressLabel = scheduledBatches
      ? `${Math.round((completedBatches / scheduledBatches) * 100)}%`
      : undefined;
    const orderContext = [
      productNames.join(', '),
      batchLabel ?? '',
      `${input.locale === 'es' ? 'Recogida' : 'Pickup'} ${order.pickupDate}`,
    ]
      .filter(Boolean)
      .join(' · ');
    orderResources.push({
      id: `order:${order.id}`,
      name:
        order.reference
        || (input.locale === 'es' ? 'Pedido sin referencia' : 'Order without reference'),
      context: orderContext,
      reference: order.reference || '—',
      pickupDate: order.pickupDate,
      batchLabel,
      progressLabel,
      parentId: customerResourceId,
      expanded: true,
    });
    workflowAreas.forEach((area) => orderResources.push({
      id: workflowResourceId(order.id, area.id),
      name: input.locale === 'es' ? area.es : area.en,
      parentId: `order:${order.id}`,
    }));
  });
  const unlinkedResource: SchedulerResource = {
    id: 'unlinked-work',
    name: input.locale === 'es' ? 'Trabajo sin pedido' : 'Unlinked work',
    reference: '—',
    pickupDate: '—',
  };
  let hasUnlinkedWork = false;

  if (perspective === 'order') {
    visibleOrders.forEach((order) => {
      const startDate = calendarDate(order.pickupDate);
      const endDate = calendarDate(order.pickupDate, 1);
      if (!input.includeOutsideWindow && (endDate <= windowStart || startDate >= windowEnd)) {
        return;
      }
      const resourceId = workflowResourceId(order.id, 'shipping');
      events.push({
        id: `pickup:${order.id}`,
        name: `${input.locale === 'es' ? 'Recogida' : 'Pickup'}${order.reference ? ` · ${order.reference}` : ''}`,
        calendarName: [
          input.locale === 'es' ? 'Recogida' : 'Pickup',
          order.customerName,
          order.reference,
        ]
          .filter(Boolean)
          .join(' · '),
        calendarTitle: input.locale === 'es' ? 'Recogida' : 'Pickup',
        calendarContext: [order.reference, order.customerName].filter(Boolean),
        orderReference: order.reference || undefined,
        orderAccent: orderAccent(order.id),
        startDate,
        endDate,
        allDay: true,
        readOnly: true,
        workType: 'other',
        assignedResources: [],
        publicationState: 'draft',
        publicationLabel: '',
        eventColor: 'blue',
        batchCount:
          order.orderBatchCount && order.orderBatchCount > 0
            ? order.orderBatchCount
            : undefined,
        locked: true,
        pickup: true,
      });
      assignments.push({
        id: `pickup:${order.id}:${resourceId}`,
        eventId: `pickup:${order.id}`,
        resourceId,
      });
    });
  }
  if (!input.selectedCustomerId && !input.selectedOrderId) {
    supplierDeliveries.forEach((delivery) => {
      const startDate = calendarDate(delivery.expectedDate);
      const endDate = calendarDate(delivery.expectedDate, 1);
      if (!input.includeOutsideWindow && (endDate <= windowStart || startDate >= windowEnd)) {
        return;
      }
      events.push({
        id: `delivery:${delivery.id}`,
        name: `${input.locale === 'es' ? 'Entrega de proveedor' : 'Supplier delivery'} · ${delivery.supplierName}${delivery.reference ? ` · ${delivery.reference}` : ''}`,
        calendarTitle: input.locale === 'es' ? 'Entrega de proveedor' : 'Supplier delivery',
        calendarContext: [delivery.reference, delivery.supplierName].filter(Boolean),
        startDate,
        endDate,
        allDay: true,
        readOnly: true,
        workType: 'receiving',
        assignedResources: [],
        publicationState: 'draft',
        publicationLabel: '',
        eventColor: 'purple',
        locked: true,
        delivery: true,
      });
    });
  }

  input.assignments
    .filter((item) => {
      const orderId = item.linkedTaskType === 'order' ? item.linkedTaskId : item.productionPlanId;
      const orderCustomerId = orderId ? ordersById.get(orderId)?.customerId : undefined;
      const published = input.publishedAssignments
        .some((previous) => matchesPublishedWork(item, previous));
      const staffingMatches = input.staffingFilter !== 'assigned' || item.employeeIds.length > 0;
      const unassignedMatches = input.staffingFilter !== 'unassigned' || item.employeeIds.length === 0;
      const statusMatches = !input.workStatusFilter
        || input.workStatusFilter === 'all'
        || (input.workStatusFilter === 'open' && !item.completed)
        || (input.workStatusFilter === 'completed' && Boolean(item.completed));
      const publicationMatches = !input.publicationFilter
        || input.publicationFilter === 'all'
        || (input.publicationFilter === 'draft' && !published)
        || (input.publicationFilter === 'published' && published);
      return (
        item.facilityId === input.facilityId
        && (!input.selectedTypes.length || input.selectedTypes.includes(item.type))
        && (!input.selectedCustomerId
          || item.customerId === input.selectedCustomerId
          || orderCustomerId === input.selectedCustomerId)
        && (!input.selectedOrderId || resolveOrderId(item) === input.selectedOrderId)
        && staffingMatches
        && unassignedMatches
        && statusMatches
        && publicationMatches
        && (perspective !== 'employee'
          || item.employeeIds.length === 0
          || item.employeeIds.some((id) => visibleIds.has(id)))
        && (!input.selectedEmployeeIds?.length
          || item.employeeIds.some((id) => input.selectedEmployeeIds?.includes(id)))
      );
    })
    .forEach((item) => {
      const startDate = item.allDay ? calendarDate(item.startDate) : new Date(item.startAt);
      const endDate = item.allDay ? calendarDate(item.endDate, 1) : new Date(item.endAt);
      if (endDate <= startDate) throw new Error('Invalid scheduler assignment range.');
      if (!input.includeOutsideWindow && (endDate <= windowStart || startDate >= windowEnd)) return;
      const published = input.publishedAssignments
        .some((previous) => matchesPublishedWork(item, previous));
      let publicationLabel = input.locale === 'es' ? 'Borrador' : 'Draft';
      if (published) publicationLabel = input.locale === 'es' ? 'Publicado' : 'Published';
      const orderId = resolveOrderId(item);
      const linkedOrder = orderId ? ordersById.get(orderId) : undefined;
      const context = [
        item.note,
        item.productId ? products.get(item.productId) : null,
        linkedOrder?.customerName ?? (item.customerId ? customers.get(item.customerId) : null),
        linkedOrder?.reference || null,
        item.locationLabel,
      ].filter(Boolean);
      let taskLabel = scheduleKindLabel(item.type, input.locale);
      if (item.type === 'off') taskLabel = input.locale === 'es' ? 'Libre / PTO' : 'Off / PTO';
      events.push({
        id: item.id,
        // The hierarchy already supplies customer and order. Keep each Gantt
        // leaf scannable; the full note remains available in its detail view.
        name: [taskLabel, item.productId ? products.get(item.productId) : null]
          .filter(Boolean)
          .join(' · '),
        calendarName: [taskLabel, ...context].filter(Boolean).join(' · '),
        calendarTitle: taskLabel,
        calendarContext: [
          ...new Set(
            [
              linkedOrder?.reference,
              item.productId ? products.get(item.productId) : undefined,
              linkedOrder?.customerName
                ?? (item.customerId ? customers.get(item.customerId) : undefined),
              item.locationLabel,
            ].filter((value): value is string => Boolean(value)),
          ),
        ],
        orderReference: linkedOrder?.reference || undefined,
        orderAccent: orderId ? orderAccent(orderId) : undefined,
        startDate,
        endDate,
        allDay: item.allDay,
        readOnly: true,
        workType: item.type,
        batchCount:
          item.plannedBatchCount && item.plannedBatchCount > 0 ? item.plannedBatchCount : undefined,
        cycleBatchCount:
          item.plannedBatchCount && item.plannedBatchCount > 0 ? item.plannedBatchCount : undefined,
        assignedResources: [...new Set(item.employeeIds)].flatMap(
          (employeeId) => employeesById.get(employeeId)?.name ?? [],
        ),
        publicationState: published ? 'published' : 'draft',
        publicationLabel,
        eventColor: staffingEventColor(item.employeeIds.length, item.requiredWorkerCount),
        locked: Boolean(item.completed),
      });
      if (perspective === 'order') {
        const area = workflowAreaForWork(item.type);
        const resourceId = orderId && ordersById.has(orderId) && area
          ? workflowResourceId(orderId, area)
          : unlinkedResource.id;
        if (resourceId === unlinkedResource.id) hasUnlinkedWork = true;
        assignments.push({ id: `${item.id}:${resourceId}`, eventId: item.id, resourceId });
        return;
      }
      if (perspective === 'operations') {
        // These are capability lanes, deliberately not fake equipment records.
        // A Mixing work item needs both its mixer and downstream holding-tank
        // capacity in view; equipment selections are recorded when work starts.
        const resourceIds = operationResourcesByWorkType[item.type];
        resourceIds.forEach((resourceId) => assignments.push({
          id: `${item.id}:${resourceId}`,
          eventId: item.id,
          resourceId,
        }));
        return;
      }
      const resourceIds = item.employeeIds.length
        ? [...new Set(item.employeeIds)].filter((id) => visibleIds.has(id))
        : [UNASSIGNED_RESOURCE_ID];
      resourceIds.forEach((resourceId) => assignments.push({
        id: `${item.id}:${resourceId}`,
        eventId: item.id,
        resourceId,
      }));
    });

  const timeRanges = input.productionBands.flatMap((band) => {
    const startDate = calendarDate(band.startDate);
    const endDate = calendarDate(band.endDate, 1);
    if (endDate <= startDate) throw new Error('Invalid scheduler production range.');
    const outsideWindow = endDate <= windowStart || startDate >= windowEnd;
    return !input.includeOutsideWindow && outsideWindow
      ? []
      : [
        {
          id: `production:${band.id}`,
          name: band.label,
          startDate,
          endDate,
          readOnly: true as const,
        },
      ];
  });
  const resourceTimeRanges: SchedulerPtoRange[] = [];
  if (perspective === 'employee') {
    input.pto
      .filter((block) => visibleIds.has(block.employeeId))
      .forEach((block) => {
        const start = calendarDate(block.startDate);
        const end = calendarDate(block.endDate, 1);
        if (
          end <= start
          || !Number.isInteger(block.startMinute)
          || !Number.isInteger(block.endMinute)
          || block.startMinute < 0
          || block.endMinute > MINUTES_PER_DAY
          || block.endMinute <= block.startMinute
        ) {
          throw new Error('Invalid scheduler PTO range.');
        }
        const outsideWindow = block.endDate < input.startDate || block.startDate >= input.endDate;
        if (!input.includeOutsideWindow && outsideWindow) return;
        resourceTimeRanges.push({
          id: `pto:${block.id}`,
          resourceId: block.employeeId,
          name: input.locale === 'es' ? 'Ausencia programada' : 'Time off scheduled',
          startDate: block.startDate,
          endDate: block.endDate,
          startMinute: block.startMinute,
          endMinute: block.endMinute,
          timezone: input.timezone,
          readOnly: true,
        });
      });
  }
  if (perspective === 'order') {
    const eventsByOrder = new Map<string, SchedulerPresentationEvent[]>();
    assignments.forEach((assignment) => {
      const orderResourceId = assignment.resourceId.match(/^(order:[^:]+):area:/)?.[1];
      if (!orderResourceId) return;
      const event = events.find((candidate) => candidate.id === assignment.eventId);
      if (!event) return;
      const grouped = eventsByOrder.get(orderResourceId) ?? [];
      grouped.push(event);
      eventsByOrder.set(orderResourceId, grouped);
    });
    eventsByOrder.forEach((orderEvents, resourceId) => {
      const emitted = new Set<string>();
      const addDependency = (from: SchedulerPresentationEvent, to: SchedulerPresentationEvent) => {
        const id = `${resourceId}:${from.id}:${to.id}`;
        if (from.id === to.id || emitted.has(id)) return;
        emitted.add(id);
        dependencies.push({
          id, from: from.id, to: to.id, type: 2,
        });
      };
      const chronological = (type: SchedulerPresentationEvent['workType']) => orderEvents
        .filter((event) => event.workType === type)
        .toSorted(
          (left, right) => left.startDate.getTime() - right.startDate.getTime()
              || left.id.localeCompare(right.id),
        );
      const preps = chronological('ingredient_prep');
      const mixes = chronological('mixing');
      const packages = chronological('packaging');

      // Each lane is a serial five-day run. Pair lane positions rather than
      // calendar offsets so the chain stays intact across weekends and after a
      // user moves work. This gives the Gantt a complete downstream graph.
      [preps, mixes, packages].forEach((lane) => lane.forEach((event, index) => {
        const predecessor = lane[index - 1];
        if (predecessor) addDependency(predecessor, event);
      }));
      mixes.forEach((mix, index) => {
        const prep = preps[index];
        const packaging = packages[index];
        if (prep) addDependency(prep, mix);
        if (packaging) addDependency(mix, packaging);
      });
      if (mixes.length && packages.length) {
        const finalPackage = packages.at(-1);
        const shipment = orderEvents
          .filter((event) => event.workType === 'shipment_loading')
          .toSorted((left, right) => left.startDate.getTime() - right.startDate.getTime())[0];
        const pickup = orderEvents.find((event) => event.pickup);
        if (finalPackage && shipment) addDependency(finalPackage, shipment);
        if (shipment && pickup) addDependency(shipment, pickup);
        return;
      }
      const ordered = orderEvents.toSorted(
        (left, right) => (
          workflowStep(left.workType, left.pickup) - workflowStep(right.workType, right.pickup)
          || left.startDate.getTime() - right.startDate.getTime()
          || left.endDate.getTime() - right.endDate.getTime()
          || left.id.localeCompare(right.id)
        ),
      );
      ordered.forEach((event, index) => {
        const predecessor = ordered[index - 1];
        if (predecessor) addDependency(predecessor, event);
      });
    });
  }
  return {
    perspective,
    timezone: input.timezone,
    resources: (() => {
      if (perspective === 'order') {
        return [...orderResources, ...(hasUnlinkedWork ? [unlinkedResource] : [])];
      }
      if (perspective === 'operations') {
        return [
          { id: 'mixer', name: input.locale === 'es' ? 'Mezclador' : 'Mixer' },
          {
            id: 'holding-tank',
            name: input.locale === 'es' ? 'Tanque de retención' : 'Holding tank',
          },
          {
            id: 'packaging-line',
            name: input.locale === 'es' ? 'Línea de empaque' : 'Packaging line',
          },
          {
            id: 'ingredient-prep',
            name: input.locale === 'es' ? 'Preparación de ingredientes' : 'Ingredient prep',
          },
          {
            id: 'receiving-shipping',
            name:
                  input.locale === 'es'
                    ? 'Área de recepción y envíos'
                    : 'Receiving & shipping area',
          },
          {
            id: 'operations',
            name: input.locale === 'es' ? 'Operaciones de planta' : 'Plant operations',
          },
        ];
      }
      return [
        {
          id: UNASSIGNED_RESOURCE_ID,
          name: input.locale === 'es' ? 'Sin asignar' : 'Unassigned',
        },
        ...visibleEmployees.map((employee) => ({ id: employee.id, name: employee.name })),
      ];
    })(),
    events,
    assignments,
    dependencies,
    timeRanges,
    resourceTimeRanges,
    milestones: perspective === 'order' ? visibleOrders.flatMap((order) => {
      const candidates = [
        {
          kind: 'order_received' as const,
          date: order.receivedDate,
          name: input.locale === 'es' ? 'Pedido recibido' : 'Order received',
        },
        {
          kind: 'production_complete' as const,
          date: order.productionCompleteDate,
          name: input.locale === 'es' ? 'Producción completa' : 'Production complete',
        },
      ];
      return candidates.flatMap((candidate) => {
        if (!candidate.date || !/^\d{4}-\d{2}-\d{2}$/.test(candidate.date)) return [];
        const [year, month, day] = candidate.date.split('-').map(Number);
        if (year === undefined || month === undefined || day === undefined) return [];
        const date = new Date(year, month - 1, day);
        if (date.getFullYear() !== year || date.getMonth() !== month - 1
          || date.getDate() !== day) return [];
        if (!input.includeOutsideWindow && (date < windowStart || date >= windowEnd)) return [];
        return [{
          id: `milestone:${candidate.kind}:${order.id}`,
          orderId: order.id,
          name: candidate.name,
          kind: candidate.kind,
          date,
        }];
      });
    }) : [],
  };
}
