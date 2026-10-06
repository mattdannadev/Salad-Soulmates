'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState, useTransition,
} from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  cancelSchedulePto,
  deleteScheduleEvent,
  publishSchedule,
  saveScheduleAvailability,
  saveScheduleEvent,
  saveSchedulePto,
} from '@/app/app/scheduling/actions';
import { matchesPublishedWork } from '@/domain/scheduling';
import type { ActionResult } from '@/domain/master-data';
import ConfirmDialog from '@/components/confirm-dialog';
import BryntumCalendar from './bryntum-calendar';
import BryntumGantt from './bryntum-gantt';
import BryntumScheduler from './bryntum-scheduler';
import { createSchedulerPresentation, type SchedulerPerspective } from './scheduler-presentation';
import { movableConnectedScheduleIds } from './schedule-move';
import { employeeHasConflictingAssignment } from './schedule-availability';
import plannerWindow from './planner-window';
import styles from './scheduler.module.css';

export type WorkType = | 'mixing'
  | 'ingredient_prep'
  | 'receiving'
  | 'shipment_loading'
  | 'packaging'
  | 'pre_op'
  | 'post_op'
  | 'cleaning'
  | 'other'
  | 'off';
export interface Facility {
  id: string;
  name: string;
  weeklyHours: number;
  timezone: string;
}
export interface Employee {
  id: string;
  name: string;
  facilityId: string;
  availableDays: number[];
}
export interface CustomerOrder {
  id: string;
  customerId: string;
  customerName: string;
  reference: string;
  pickupDate: string;
  receivedDate?: string;
  productionCompleteDate?: string;
  orderBatchCount?: number;
  caseCount?: number;
}
export interface SupplierDelivery {
  id: string;
  supplierName: string;
  reference: string;
  expectedDate: string;
  note: string;
  lines: { ingredientName: string; quantity: number; uom: string }[];
}
export interface Assignment {
  id: string;
  revision: number;
  facilityId: string;
  startAt: string;
  endAt: string;
  allDay: boolean;
  timeZone: string;
  startDate: string;
  endDate: string; // Inclusive business date.
  type: WorkType;
  /** Planned batches covered by this work block, when the work is batch-based. */
  plannedBatchCount?: number | null;
  completed?: boolean;
  requiredWorkerCount: number;
  employeeIds: string[];
  note: string | null;
  productionPlanId: string | null;
  linkedTaskType:
    | 'production_plan'
    | 'order'
    | 'purchase_draft'
    | 'planned_mixer_batch'
    | 'planned_spice_preparation'
    | 'production_lot'
    | null;
  linkedTaskId: string | null;
  productId: string | null;
  customerId: string | null;
  locationLabel: string | null;
  availabilityOverrideReason: string | null;
}
export interface LinkedTaskOption {
  type: NonNullable<Assignment['linkedTaskType']>;
  id: string;
  productionPlanId: string;
  label: string;
}
export interface PtoBlock {
  id: string;
  employeeId: string;
  ptoTypeId?: string;
  startDate: string;
  endDate: string;
  startMinute: number;
  endMinute: number;
  privateNote: string;
  revision: number;
}
export interface PtoType {
  id: string;
  name: string;
  color: string;
  active: boolean;
}
export interface ProductionBand {
  id: string;
  label: string;
  startDate: string;
  endDate: string;
}

export type AssignmentInput = Omit<Assignment, 'id' | 'revision'>;

interface Props {
  locale: 'en' | 'es';
  facilities: Facility[];
  employees: Employee[];
  assignments: Assignment[];
  publishedAssignments: Pick<
    Assignment,
    | 'id'
    | 'startAt'
    | 'endAt'
    | 'allDay'
    | 'timeZone'
    | 'startDate'
    | 'endDate'
    | 'employeeIds'
    | 'requiredWorkerCount'
    | 'type'
    | 'note'
    | 'productionPlanId'
    | 'linkedTaskType'
    | 'linkedTaskId'
    | 'productId'
    | 'customerId'
    | 'locationLabel'
  >[];
  publicationRevision: number;
  pto: PtoBlock[];
  ptoTypes: PtoType[];
  productionBands: ProductionBand[];
  linkedTasks: LinkedTaskOption[];
  products: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  customerOrders: CustomerOrder[];
  supplierDeliveries: SupplierDelivery[];
  customerProductIds: Record<string, string[]>;
  canManage: boolean;
  initialPeriodStart?: string;
  initialPeriodEnd?: string;
  initialSurface?: 'board' | 'calendar';
  initialOrderId?: string;
  initialFocusDate?: string;
  initialWorkId?: string;
}

const types: WorkType[] = [
  'pre_op',
  'receiving',
  'ingredient_prep',
  'mixing',
  'packaging',
  'shipment_loading',
  'post_op',
  'cleaning',
  'other',
  'off',
];
const labels: Record<'en' | 'es', Record<WorkType, string>> = {
  en: {
    mixing: 'Mixing',
    ingredient_prep: 'Ingredient prep',
    receiving: 'Receive delivery',
    shipment_loading: 'Load pickup',
    packaging: 'Packaging',
    pre_op: 'Pre-Op',
    post_op: 'Post-Op',
    cleaning: 'Cleaning',
    other: 'Other work',
    off: 'Off / PTO',
  },
  es: {
    mixing: 'Mezcla',
    ingredient_prep: 'Preparación de ingredientes',
    receiving: 'Recibir entrega',
    shipment_loading: 'Cargar recolección',
    packaging: 'Empaque',
    pre_op: 'Preoperación',
    post_op: 'Postoperación',
    cleaning: 'Limpieza',
    other: 'Otro trabajo',
    off: 'Libre / PTO',
  },
};
const dialogFocusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function assignmentOrderId(item: Assignment) {
  return item.linkedTaskType === 'order' ? item.linkedTaskId : item.productionPlanId;
}

function addDays(date: string, days: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
}
function daysBetween(first: string, second: string) {
  return Math.round(
    (Date.UTC(
      Number(second.slice(0, 4)),
      Number(second.slice(5, 7)) - 1,
      Number(second.slice(8, 10)),
    )
      - Date.UTC(
        Number(first.slice(0, 4)),
        Number(first.slice(5, 7)) - 1,
        Number(first.slice(8, 10)),
      ))
      / 86400000,
  );
}
function localDate(date: string): Date {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(year, month - 1, day);
}
function dateKey(value: Date | string): string {
  if (typeof value === 'string' && /^\d{4}-\d\d-\d\d$/.test(value)) return value;
  const date = value instanceof Date ? value : new Date(value);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
}
function facilityDateTimeParts(value: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone,
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).formatToParts(value);
  const part = (type: Intl.DateTimeFormatPartTypes) => (
    parts.find((item) => item.type === type)?.value
  );
  return {
    year: part('year'),
    month: part('month'),
    day: part('day'),
    hour: part('hour'),
    minute: part('minute'),
  };
}
function facilityInputValue(instant: string, timeZone: string) {
  const parts = facilityDateTimeParts(new Date(instant), timeZone);
  return `${parts.year}-${parts.month}-${parts.day}T${parts.hour}:${parts.minute}`;
}
function facilityInputInstant(value: string, timeZone: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/.exec(value);
  if (!match) throw new Error('Invalid local schedule time.');
  const [, year, month, day, hour, minute] = match;
  const utcYear = Number(year);
  const utcMonth = Number(month) - 1;
  const utcDay = Number(day);
  const utcHour = Number(hour);
  const utcMinute = Number(minute);
  const target = Date.UTC(utcYear, utcMonth, utcDay, utcHour, utcMinute);
  let candidate = target;
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const parts = facilityDateTimeParts(new Date(candidate), timeZone);
    const rendered = Date.UTC(
      Number(parts.year),
      Number(parts.month) - 1,
      Number(parts.day),
      Number(parts.hour),
      Number(parts.minute),
    );
    const adjustment = target - rendered;
    if (adjustment === 0) break;
    candidate += adjustment;
  }
  if (facilityInputValue(new Date(candidate).toISOString(), timeZone) !== value) {
    throw new Error('That local time does not exist in the facility time zone.');
  }
  if (
    [-3600000, 3600000].some(
      (offset) => (
        facilityInputValue(new Date(candidate + offset).toISOString(), timeZone) === value
      ),
    )
  ) {
    throw new Error('That local time occurs twice in the facility time zone. Choose another time.');
  }
  return new Date(candidate).toISOString();
}
function countWeekdays(start: string, endExclusive: string): number {
  let count = 0;
  for (let date = start; date < endExclusive; date = addDays(date, 1)) {
    const weekday = localDate(date).getDay();
    if (weekday !== 0 && weekday !== 6) count += 1;
  }
  return count;
}
function assignmentDates(assignment: Assignment, start: string, endExclusive: string): string[] {
  const first = assignment.startDate > start ? assignment.startDate : start;
  const assignmentEnd = addDays(assignment.endDate, 1);
  const last = assignmentEnd < endExclusive ? assignmentEnd : endExclusive;
  const dates: string[] = [];
  for (let date = first; date < last; date = addDays(date, 1)) dates.push(date);
  return dates;
}
function dateRangesOverlap(
  firstStart: string,
  firstEnd: string,
  secondStart: string,
  secondEnd: string,
) {
  return firstStart <= secondEnd && firstEnd >= secondStart;
}
function scheduleIntervalsOverlap(first: AssignmentInput, second: Assignment) {
  if (first.allDay || second.allDay) {
    return dateRangesOverlap(first.startDate, first.endDate, second.startDate, second.endDate);
  }
  const firstStart = Date.parse(first.startAt);
  const firstEnd = Date.parse(first.endAt);
  const secondStart = Date.parse(second.startAt);
  const secondEnd = Date.parse(second.endAt);
  return (
    Number.isFinite(firstStart)
    && Number.isFinite(firstEnd)
    && Number.isFinite(secondStart)
    && Number.isFinite(secondEnd)
    && firstStart < secondEnd
    && secondStart < firstEnd
  );
}
function conflictsFor(candidate: AssignmentInput, assignments: Assignment[], excludedId?: string) {
  return assignments.filter(
    (item) => item.id !== excludedId
      && scheduleIntervalsOverlap(candidate, item)
      && item.employeeIds.some((id) => candidate.employeeIds.includes(id)),
  );
}

export default function WorkforceScheduler({
  locale,
  facilities,
  employees,
  assignments,
  publishedAssignments,
  publicationRevision,
  pto,
  ptoTypes,
  productionBands,
  linkedTasks,
  products,
  customers,
  customerOrders,
  supplierDeliveries,
  customerProductIds,
  canManage,
  initialPeriodStart = '',
  initialPeriodEnd = '',
  initialSurface = 'board',
  initialOrderId = undefined,
  initialFocusDate = undefined,
  initialWorkId = undefined,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const es = locale === 'es';
  const noProductLabel = es ? 'Sin producto' : 'No product';
  const selectCustomerLabel = es ? 'Primero seleccione un cliente' : 'Select a customer first';
  const facilityId = facilities[0]?.id ?? '';
  // Plant planning and execution calendars both open on a workweek range.
  // Planning starts from demand: customer, then order, then the work needed to
  // fulfill it. People and locations remain alternate projections of the same Work.
  const schedulerPerspective: SchedulerPerspective = 'order';
  const [scheduleExpanded, setScheduleExpanded] = useState(false);
  const expandScheduleLabel = es ? 'Pantalla completa' : 'Fullscreen';
  const exitExpandedScheduleLabel = es ? 'Salir de pantalla completa' : 'Exit fullscreen';
  const exitExpandedScheduleHint = es
    ? 'Volver al tamaño normal (Esc)'
    : 'Return to normal size (Esc)';
  const calendarRef = useRef<HTMLDivElement>(null);
  const expandButtonRef = useRef<HTMLButtonElement>(null);
  // The Bryntum trial packages cannot load their full Calendar and Scheduler
  // bundles in one browser runtime. Surface selection is therefore a real page
  // navigation: each native product gets a clean, supported runtime.
  const initialOrderStart = initialOrderId
    ? productionBands.find((band) => band.id === initialOrderId)?.startDate
    : undefined;
  const [visibleDate, setVisibleDate] = useState(() => (
    localDate(initialFocusDate ?? initialOrderStart ?? dateKey(new Date()))
  ));
  const [appliedFocusDate, setAppliedFocusDate] = useState(initialFocusDate);
  if (appliedFocusDate !== initialFocusDate) {
    setAppliedFocusDate(initialFocusDate);
    if (initialFocusDate) setVisibleDate(localDate(initialFocusDate));
  }
  // Ignore the initial filtered-work suggestion once. Order-origin navigation
  // starts at production start; the unfiltered planner starts today.
  const consumingFocusDate = useRef(true);
  const [periodStart, setPeriodStart] = useState(initialPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd);
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const requestedCustomerId = (() => {
    if (initialOrderId) {
      return customerOrders.find((order) => order.id === initialOrderId)?.customerId ?? null;
    }
    const customerId = searchParams.get('customer');
    return customers.some((customer) => customer.id === customerId) ? customerId : null;
  })();
  const [selectedOrderId, setSelectedOrderId] = useState<string | null>(initialOrderId ?? null);
  const [selectedCustomerId, setSelectedCustomerId] = useState<string | null>(requestedCustomerId);
  const [incomingSelection, setIncomingSelection] = useState({
    orderId: initialOrderId,
    customerId: requestedCustomerId,
  });
  if (incomingSelection.orderId !== initialOrderId
    || incomingSelection.customerId !== requestedCustomerId) {
    setIncomingSelection({ orderId: initialOrderId, customerId: requestedCustomerId });
    setSelectedOrderId(initialOrderId ?? null);
    setSelectedCustomerId(requestedCustomerId);
  }
  useEffect(() => {
    if (initialFocusDate) consumingFocusDate.current = true;
  }, [initialFocusDate]);
  const scheduleSurface = initialSurface;
  const activeScheduleSurface = (() => {
    if (scheduleSurface === 'calendar') {
      return 'calendar';
    }
    if (searchParams.get('perspective') === 'employee') {
      return 'staffing';
    }
    return 'board';
  })();
  const [employeeSearch, setEmployeeSearch] = useState('');
  const selectedTypes = useMemo<WorkType[]>(() => [], []);
  const scheduleParameters = new URLSearchParams();
  if (initialPeriodStart && initialPeriodEnd) {
    scheduleParameters.set('start', initialPeriodStart);
    scheduleParameters.set('end', initialPeriodEnd);
  }
  if (selectedCustomerId) scheduleParameters.set('customer', selectedCustomerId);
  if (selectedOrderId) scheduleParameters.set('order', selectedOrderId);
  if (selectedEmployees.length) scheduleParameters.set('employees', selectedEmployees.join(','));
  const productionPlanHref = `/app/scheduling${scheduleParameters.size ? `?${scheduleParameters}` : ''}`;
  const calendarParameters = new URLSearchParams(scheduleParameters);
  calendarParameters.set('surface', 'calendar');
  const executionCalendarHref = `/app/scheduling?${calendarParameters}`;
  const [sortPeople, setSortPeople] = useState<'least' | 'most' | 'name'>('least');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [duplicatingId, setDuplicatingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [summaryEventId, setSummaryEventId] = useState<string | null>(null);
  const [form, setForm] = useState<AssignmentInput>({
    facilityId,
    startAt: new Date().toISOString(),
    endAt: new Date(new Date().getTime() + 60 * 60 * 1000).toISOString(),
    allDay: false,
    timeZone: facilities[0]?.timezone ?? 'UTC',
    startDate: dateKey(new Date()),
    endDate: dateKey(new Date()),
    type: 'mixing',
    requiredWorkerCount: 1,
    employeeIds: [],
    note: null,
    productionPlanId: null,
    linkedTaskType: null,
    linkedTaskId: null,
    productId: null,
    customerId: null,
    locationLabel: null,
    availabilityOverrideReason: null,
  });
  const [message, setMessage] = useState('');
  const [ptoOpen, setPtoOpen] = useState(false);
  const [ptoForm, setPtoForm] = useState<PtoBlock>({
    id: '',
    employeeId: '',
    ptoTypeId: ptoTypes.find((type) => type.active)?.id ?? '',
    startDate: dateKey(new Date()),
    endDate: dateKey(new Date()),
    startMinute: 0,
    endMinute: 1440,
    privateNote: '',
    revision: 0,
  });
  const [pending, startTransition] = useTransition();
  const [calendarPending, setCalendarPending] = useState(false);
  const [deletingWorkId, setDeletingWorkId] = useState<string | null>(null);
  const [assignmentState, setAssignmentState] = useState({
    source: assignments,
    items: assignments,
  });
  if (assignmentState.source !== assignments) {
    setAssignmentState({ source: assignments, items: assignments });
  }
  const localAssignments = assignmentState.items;
  const [calendarResetVersion, setCalendarResetVersion] = useState(0);
  const calendarMutationRef = useRef(false);
  const dialogRef = useRef<HTMLElement>(null);
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(pending);
  let activeDialog: 'pto' | 'assignment' | 'summary' | null = null;
  if (ptoOpen) activeDialog = 'pto';
  else if (formOpen) activeDialog = 'assignment';
  else if (summaryEventId) activeDialog = 'summary';

  useEffect(() => {
    if (!scheduleExpanded) return undefined;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    const onKeyDown = (event: KeyboardEvent) => {
      if (activeDialog) return;
      if (event.key === 'Escape') {
        event.preventDefault();
        setScheduleExpanded(false);
        expandButtonRef.current?.focus();
      } else if (event.key === 'Tab') {
        const calendar = calendarRef.current;
        const items = Array.from(
          calendar?.querySelectorAll<HTMLElement>(dialogFocusable) ?? [],
        ).filter((element) => element.getClientRects().length > 0);
        const first = items[0];
        const last = items[items.length - 1];
        if (first && last && event.shiftKey && document.activeElement === first) {
          event.preventDefault();
          last.focus();
        } else if (first && last && !event.shiftKey && document.activeElement === last) {
          event.preventDefault();
          first.focus();
        }
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [scheduleExpanded, activeDialog]);

  useEffect(() => {
    pendingRef.current = pending;
  }, [pending]);

  useEffect(() => {
    if (!activeDialog) {
      const opener = dialogOpenerRef.current;
      dialogOpenerRef.current = null;
      if (opener?.isConnected) opener.focus();
      return undefined;
    }
    const dialog = dialogRef.current;
    if (!dialog) return undefined;
    const focusable = () => Array.from(dialog.querySelectorAll<HTMLElement>(dialogFocusable))
      .filter((element) => element.getClientRects().length > 0);
    (focusable()[0] ?? dialog).focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (!pendingRef.current) {
          event.preventDefault();
          if (activeDialog === 'pto') setPtoOpen(false);
          else setFormOpen(false);
        }
        return;
      }
      if (event.key !== 'Tab') return;
      const items = focusable();
      const first = items[0];
      const last = items[items.length - 1];
      if (!first || !last) {
        event.preventDefault();
        dialog.focus();
      } else if (
        event.shiftKey
        && (document.activeElement === first || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        last.focus();
      } else if (
        !event.shiftKey
        && (document.activeElement === last || !dialog.contains(document.activeElement))
      ) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocus = (event: FocusEvent) => {
      if (event.target instanceof Node && !dialog.contains(event.target)) {
        (focusable()[0] ?? dialog).focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocus);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocus);
    };
  }, [activeDialog]);

  function rememberDialogOpener() {
    dialogOpenerRef.current = document.activeElement instanceof HTMLElement
      ? document.activeElement
      : null;
  }

  const facility = facilities.find((item) => item.id === facilityId);
  const facilityEmployees = useMemo(
    () => employees.filter((item) => item.facilityId === facilityId),
    [employees, facilityId],
  );
  const facilityAssignments = useMemo(
    () => localAssignments.filter((item) => item.facilityId === facilityId),
    [localAssignments, facilityId],
  );
  const availableOrders = useMemo(
    () => customerOrders.filter(
      (order) => !selectedCustomerId || order.customerId === selectedCustomerId,
    ),
    [customerOrders, selectedCustomerId],
  );
  // A filter must take the planning surface to the work it selected. Keeping
  // the prior week after a customer/type/people change leaves an apparently
  // empty plan and forces people to hunt through the time axis.
  const firstFilteredWorkDate = useMemo(
    () => facilityAssignments
      .filter(
        (item) => !selectedCustomerId
            || item.customerId === selectedCustomerId
            || customerOrders.some(
              (order) => (
                order.id === assignmentOrderId(item) && order.customerId === selectedCustomerId
              ),
            ),
      )
      .filter((item) => !selectedOrderId || assignmentOrderId(item) === selectedOrderId)
      .filter((item) => !selectedTypes.length || selectedTypes.includes(item.type))
      .filter(
        (item) => !selectedEmployees.length
            || item.employeeIds.some((employeeId) => selectedEmployees.includes(employeeId)),
      )
      .map((item) => item.startDate)
      .toSorted()[0] ?? null,
    [
      facilityAssignments,
      customerOrders,
      selectedCustomerId,
      selectedOrderId,
      selectedTypes,
      selectedEmployees,
    ],
  );
  useEffect(() => {
    if (!firstFilteredWorkDate) return;
    if (consumingFocusDate.current) {
      consumingFocusDate.current = false;
      return;
    }
    setVisibleDate((current) => (
      dateKey(current) === firstFilteredWorkDate ? current : localDate(firstFilteredWorkDate)
    ));
  }, [firstFilteredWorkDate]);
  const displayedEmployees = useMemo(
    () => (selectedEmployees.length
      ? facilityEmployees.filter((item) => selectedEmployees.includes(item.id))
      : facilityEmployees),
    [facilityEmployees, selectedEmployees],
  );
  const shownIds = useMemo(
    () => new Set(displayedEmployees.map((item) => item.id)),
    [displayedEmployees],
  );
  const activeDate = dateKey(visibleDate);
  const weekStart = addDays(activeDate, -((visibleDate.getDay() + 6) % 7));
  const plannerEndExclusive = plannerWindow(activeDate).endExclusive;
  const defaultStart = activeScheduleSurface === 'board' ? activeDate : weekStart;
  // Execution surfaces retain their existing focus window; the planner is bounded.
  const defaultEndExclusive = activeScheduleSurface === 'board'
    ? plannerEndExclusive : addDays(defaultStart, 14);
  const trialPresentation = useMemo(
    () => (facility
      ? createSchedulerPresentation({
        locale,
        facilityId,
        timezone: facility.timezone,
        employees,
        assignments: localAssignments,
        publishedAssignments,
        pto,
        productionBands,
        products,
        customers,
        customerOrders,
        supplierDeliveries,
        visibleEmployeeIds: displayedEmployees.map((employee) => employee.id),
        selectedEmployeeIds: selectedEmployees,
        selectedCustomerId,
        selectedOrderId,
        selectedTypes,
        perspective: activeScheduleSurface === 'staffing' ? 'employee' : schedulerPerspective,
        startDate: defaultStart,
        endDate: defaultEndExclusive,
        includeOutsideWindow: activeScheduleSurface !== 'board',
      })
      : null),
    [
      facility,
      locale,
      facilityId,
      employees,
      localAssignments,
      publishedAssignments,
      pto,
      productionBands,
      products,
      customers,
      customerOrders,
      supplierDeliveries,
      displayedEmployees,
      selectedTypes,
      selectedEmployees,
      selectedCustomerId,
      selectedOrderId,
      schedulerPerspective,
      activeScheduleSurface,
      defaultStart,
      defaultEndExclusive,
    ],
  );
  const reportStart = periodStart || defaultStart;
  const reportEndExclusive = periodEnd ? addDays(periodEnd, 1) : defaultEndExclusive;
  const reportValid = reportEndExclusive > reportStart;
  const capacityDays = reportValid ? countWeekdays(reportStart, reportEndExclusive) : 0;
  const capacityHours = (capacityDays * (facility?.weeklyHours ?? 40)) / 5;
  const utilization = useMemo(
    () => new Map(
      facilityEmployees.map((person) => {
        const scheduledDates = new Set<string>();
        facilityAssignments
          .filter((item) => item.employeeIds.includes(person.id) && item.type !== 'off')
          .forEach((item) => assignmentDates(item, reportStart, reportEndExclusive)
            .forEach((date) => scheduledDates.add(date)));
        const hours = (scheduledDates.size * (facility?.weeklyHours ?? 40)) / 5;
        return [
          person.id,
          {
            hours,
            percent: capacityHours ? Math.round((hours / capacityHours) * 100) : 0,
          },
        ];
      }),
    ),
    [
      facilityEmployees,
      facilityAssignments,
      reportStart,
      reportEndExclusive,
      facility,
      capacityHours,
    ],
  );
  const peopleForPanel = useMemo(
    () => facilityEmployees
      .filter((person) => person.name.toLocaleLowerCase()
        .includes(employeeSearch.trim().toLocaleLowerCase()))
      .toSorted((left, right) => {
        if (sortPeople === 'name') return left.name.localeCompare(right.name);
        const difference = (utilization.get(left.id)?.percent ?? 0)
          - (utilization.get(right.id)?.percent ?? 0);
        return (
          (sortPeople === 'least' ? difference : -difference)
            || left.name.localeCompare(right.name)
        );
      }),
    [facilityEmployees, employeeSearch, sortPeople, utilization],
  );

  const overlappingIds = new Set(
    facilityAssignments
      .filter((item) => conflictsFor(item, facilityAssignments, item.id).length > 0)
      .map((item) => item.id),
  );
  const relevantBands = productionBands.filter(
    (band) => band.startDate < reportEndExclusive && band.endDate >= reportStart,
  );
  // A schedule can contain prep and pickup work outside the production run. The
  // Gantt's "Plan start" control intentionally targets the run itself, not the
  // beginning of the generic two-week viewing window.
  const planStartDate = useMemo(
    () => productionBands
      .filter((band) => band.startDate < defaultEndExclusive && band.endDate >= defaultStart)
      .toSorted((left, right) => left.startDate.localeCompare(right.startDate))[0]?.startDate
      ?? defaultStart,
    [productionBands, defaultStart, defaultEndExclusive],
  );
  const eventSummary = useMemo(() => {
    if (!summaryEventId) return null;
    if (summaryEventId.startsWith('pickup:')) {
      const order = customerOrders.find(
        (item) => item.id === summaryEventId.slice('pickup:'.length),
      );
      return order
        ? {
          title: es ? 'Recogida del cliente' : 'Customer pickup',
          details: [
            [es ? 'Cliente' : 'Customer', order.customerName],
            [es ? 'Pedido' : 'Order', order.reference || '—'],
            [es ? 'Fecha de recogida' : 'Pickup date', order.pickupDate],
          ],
        }
        : null;
    }
    if (summaryEventId.startsWith('delivery:')) {
      const delivery = supplierDeliveries.find(
        (item) => item.id === summaryEventId.slice('delivery:'.length),
      );
      return delivery
        ? {
          title: es ? 'Entrega de proveedor' : 'Supplier delivery',
          details: [
            [es ? 'Proveedor' : 'Supplier', delivery.supplierName],
            [es ? 'Referencia' : 'Reference', delivery.reference || '—'],
            [es ? 'Fecha esperada' : 'Expected date', delivery.expectedDate],
            [
              es ? 'Artículos pendientes' : 'Outstanding items',
              delivery.lines
                .map((line) => `${line.ingredientName}: ${line.quantity} ${line.uom}`)
                .join(', ') || '—',
            ],
            [es ? 'Notas' : 'Notes', delivery.note || '—'],
          ],
        }
        : null;
    }
    const assignment = facilityAssignments.find((item) => item.id === summaryEventId);
    if (!assignment) return null;
    const orderId = assignment.linkedTaskType === 'order' ? assignment.linkedTaskId : assignment.productionPlanId;
    const order = orderId ? customerOrders.find((item) => item.id === orderId) : undefined;
    const linkedTask = assignment.linkedTaskType && assignment.linkedTaskId
      ? linkedTasks.find(
        (item) => item.type === assignment.linkedTaskType && item.id === assignment.linkedTaskId,
      )
      : undefined;
    const people = assignment.employeeIds
      .map((id) => employees.find((person) => person.id === id)?.name)
      .filter(Boolean)
      .join(', ') || (es ? 'Sin asignar' : 'Unassigned');
    const batchCount = assignment.plannedBatchCount ?? 0;
    return {
      title: labels[locale][assignment.type],
      details: [
        [
          es ? 'Trabajo' : 'Work task',
          assignment.note || linkedTask?.label || labels[locale][assignment.type],
        ],
        [
          es ? 'Pedido' : 'Order',
          order ? `${order.customerName}${order.reference ? ` · ${order.reference}` : ''}` : '—',
        ],
        [es ? 'Quién trabaja' : 'Who is working', people],
        [es ? 'Lotes' : 'Batches', batchCount ? String(batchCount) : '—'],
        [
          es ? 'Horario' : 'Schedule',
          `${facilityInputValue(assignment.startAt, assignment.timeZone)} – ${facilityInputValue(assignment.endAt, assignment.timeZone)}`,
        ],
      ],
    };
  }, [
    summaryEventId,
    customerOrders,
    supplierDeliveries,
    facilityAssignments,
    linkedTasks,
    employees,
    es,
    locale,
  ]);
  const summaryAssignment = summaryEventId
    ? facilityAssignments.find((item) => item.id === summaryEventId)
    : undefined;
  const selectableProducts = useMemo(() => {
    if (!form.customerId) return [];
    const ids = new Set(customerProductIds[form.customerId] ?? []);
    return products.filter((product) => ids.has(product.id));
  }, [customerProductIds, form.customerId, products]);
  const selectableOrders = useMemo(
    () => customerOrders.filter((order) => (
      !form.customerId || order.customerId === form.customerId
    )),
    [customerOrders, form.customerId],
  );
  const employeeSchedulingDetails = useCallback(
    (person: Employee) => {
      const scheduled = facilityAssignments.filter((item) => (
        item.id !== editingId
          && item.type !== 'off'
          && item.employeeIds.includes(person.id)
          && scheduleIntervalsOverlap(form, item)
      ));
      if (scheduled.length) {
        const work = scheduled
          .map((item) => {
            let time = es ? 'todo el día' : 'all day';
            if (!item.allDay) {
              const start = facilityInputValue(item.startAt, item.timeZone).slice(11);
              const end = facilityInputValue(item.endAt, item.timeZone).slice(11);
              time = `${start}–${end}`;
            }
            return `${time} ${labels[locale][item.type]}`;
          })
          .join(', ');
        return `${es ? 'Ya programado:' : 'Already scheduled:'} ${work}`;
      }
      if (
        pto.some(
          (block) => block.employeeId === person.id
            && block.startDate <= form.endDate
            && block.endDate >= form.startDate,
        )
      ) return es ? 'Ausencia programada' : 'Time off scheduled';
      for (let date = form.startDate; date <= form.endDate; date = addDays(date, 1)) {
        if (!person.availableDays.includes(localDate(date).getDay())) return es ? 'Fuera de disponibilidad' : 'Outside availability';
      }
      return null;
    },
    [editingId, es, facilityAssignments, form, locale, pto],
  );
  const persist = useCallback(
    async (input: AssignmentInput, id?: string) => {
      const previous = id ? localAssignments.find((item) => item.id === id) : undefined;
      const persistedId = id ?? crypto.randomUUID();
      const result = await saveScheduleEvent({
        id: persistedId,
        facility_id: input.facilityId,
        revision: previous?.revision ?? 0,
        start_at: input.startAt,
        end_at: input.endAt,
        all_day: input.allDay,
        start_on: input.startDate,
        end_on: addDays(input.endDate, 1),
        kind: input.type,
        required_worker_count: input.requiredWorkerCount,
        planned_batch_count: input.plannedBatchCount ?? null,
        title: input.note ?? '',
        production_plan_id: input.productionPlanId,
        linked_task_type: input.linkedTaskType,
        linked_task_id: input.linkedTaskId,
        product_id: input.productId,
        customer_id: input.customerId,
        location_label: input.locationLabel,
        availability_override_reason: input.availabilityOverrideReason,
        employee_ids: input.employeeIds,
      });
      return result;
    },
    [localAssignments],
  );

  const resetCalendarFromLocalState = useCallback(() => {
    setAssignmentState((current) => ({ ...current, items: [...current.items] }));
    setCalendarResetVersion((version) => version + 1);
  }, []);

  const changeCalendarDates = useCallback(
    async (id: string, startDate: Date) => {
      if (!canManage || pending || calendarMutationRef.current) return;
      const previous = facilityAssignments.find((item) => item.id === id);
      if (!previous || previous.completed) return;
      calendarMutationRef.current = true;
      setCalendarPending(true);
      setMessage('');
      let needsServerReconciliation = false;
      try {
        const dropped = facilityDateTimeParts(startDate, previous.timeZone);
        const droppedStartDate = `${dropped.year}-${dropped.month}-${dropped.day}`;
        const daysMoved = daysBetween(previous.startDate, droppedStartDate);
        const affected = movableConnectedScheduleIds(
          id,
          facilityAssignments,
          trialPresentation?.dependencies ?? [],
        );
        const result = await affected.reduce(async (previousResult, affectedId) => {
          const prior = await previousResult;
          if (!prior.ok) return prior;
          const assignment = facilityAssignments.find((item) => item.id === affectedId);
          if (!assignment) return prior;
          const movedStartDate = addDays(assignment.startDate, daysMoved);
          const durationDays = Math.max(
            1,
            daysBetween(assignment.startDate, assignment.endDate) + 1,
          );
          const movedEndDate = addDays(movedStartDate, durationDays);
          const movedStart = new Date(
            facilityInputInstant(`${movedStartDate}T00:00`, assignment.timeZone),
          );
          const movedEnd = new Date(
            facilityInputInstant(`${movedEndDate}T00:00`, assignment.timeZone),
          );
          return persist(
            {
              ...assignment,
              startAt: movedStart.toISOString(),
              endAt: movedEnd.toISOString(),
              startDate: movedStartDate,
              endDate: addDays(movedEndDate, -1),
              allDay: true,
            },
            affectedId,
          );
        }, Promise.resolve<ActionResult>({ ok: true, message: '' }));
        const success = es ? 'Asignación guardada.' : 'Assignment saved.';
        setMessage(result.ok ? success : result.message);
        if (!result.ok) {
          needsServerReconciliation = true;
          resetCalendarFromLocalState();
        } else {
          // The local complete snapshot updates immediately. Refreshing the
          // server component then reconciles revisions and computed context;
          // the stable Bryntum ProjectModel applies that response atomically.
          router.refresh();
        }
      } catch (error) {
        console.error('scheduler.calendar-mutation-failed', {
          code: error instanceof Error ? error.name : 'unknown',
        });
        setMessage(
          es
            ? 'No se pudo guardar. Revise las fechas y vuelva a intentarlo.'
            : 'Could not save. Check the dates and try again.',
        );
        needsServerReconciliation = true;
        resetCalendarFromLocalState();
      } finally {
        if (needsServerReconciliation) startTransition(() => router.refresh());
        setCalendarPending(false);
        calendarMutationRef.current = false;
      }
    },
    [
      canManage, pending, facilityAssignments, persist, es, router, trialPresentation,
      resetCalendarFromLocalState,
    ],
  );

  const openForm = useCallback(
    (assignment?: Assignment) => {
      if (!canManage || pending || calendarPending) return;
      rememberDialogOpener();
      setEditingId(assignment?.id ?? null);
      setDuplicatingId(null);
      setForm(
        assignment
          ? {
            facilityId: assignment.facilityId,
            startAt: assignment.startAt,
            endAt: assignment.endAt,
            allDay: assignment.allDay,
            timeZone: assignment.timeZone,
            startDate: assignment.startDate,
            endDate: assignment.endDate,
            type: assignment.type,
            plannedBatchCount: assignment.plannedBatchCount ?? null,
            completed: assignment.completed ?? false,
            requiredWorkerCount: assignment.requiredWorkerCount,
            employeeIds: assignment.employeeIds,
            note: assignment.note,
            productionPlanId: assignment.productionPlanId,
            linkedTaskType: assignment.linkedTaskType,
            linkedTaskId: assignment.linkedTaskId,
            productId: assignment.productId,
            customerId: assignment.customerId,
            locationLabel: assignment.locationLabel,
            availabilityOverrideReason: assignment.availabilityOverrideReason,
          }
          : (() => {
            const allDay = activeScheduleSurface === 'board';
            const timeZone = facility?.timezone ?? 'UTC';
            const order = selectedOrderId
              ? customerOrders.find((item) => item.id === selectedOrderId)
              : undefined;
            const customerId = order?.customerId ?? selectedCustomerId;
            const productIds = customerId ? (customerProductIds[customerId] ?? []) : [];
            return {
              facilityId,
              startAt: allDay
                ? facilityInputInstant(`${activeDate}T00:00`, timeZone)
                : facilityInputInstant(`${activeDate}T08:00`, timeZone),
              endAt: allDay
                ? facilityInputInstant(`${addDays(activeDate, 1)}T00:00`, timeZone)
                : facilityInputInstant(`${activeDate}T09:00`, timeZone),
              allDay,
              timeZone,
              startDate: activeDate,
              endDate: activeDate,
              type: 'mixing',
              requiredWorkerCount: 1,
              employeeIds: activeScheduleSurface === 'board' ? [] : selectedEmployees,
              note: null,
              productionPlanId: null,
              linkedTaskType: order ? 'order' : null,
              linkedTaskId: order?.id ?? null,
              productId: productIds.length === 1 ? (productIds[0] ?? null) : null,
              customerId: customerId ?? null,
              plannedBatchCount: order?.orderBatchCount ?? null,
              locationLabel: null,
              availabilityOverrideReason: null,
            };
          })(),
      );
      setFormOpen(true);
      setMessage('');
    },
    [
      canManage, pending, calendarPending, facilityId, activeDate, selectedEmployees, facility,
      activeScheduleSurface, selectedCustomerId, selectedOrderId, customerOrders,
      customerProductIds,
    ],
  );
  const duplicateAssignment = useCallback(
    (id: string) => {
      const assignment = facilityAssignments.find((item) => item.id === id);
      if (!assignment || !canManage || pending || calendarPending) return;
      openForm(assignment);
      setEditingId(null);
      setDuplicatingId(id);
    },
    [calendarPending, canManage, facilityAssignments, openForm, pending],
  );
  const editAssignment = useCallback(
    (id: string) => {
      const assignment = facilityAssignments.find((item) => item.id === id);
      if (assignment) openForm(assignment);
    },
    [facilityAssignments, openForm],
  );
  const viewExecutionSchedule = useCallback(
    (id: string) => {
      const assignment = facilityAssignments.find((item) => item.id === id);
      if (!assignment) return;
      const parameters = new URLSearchParams({
        surface: 'calendar',
        date: assignment.startDate,
        start: assignment.startDate,
        end: assignment.endDate,
        work: assignment.id,
      });
      if (assignment.linkedTaskType === 'order' && assignment.linkedTaskId) {
        parameters.set('order', assignment.linkedTaskId);
      }
      // Gantt and Calendar ship separate Bryntum Grid runtimes. A client-side
      // transition would keep the Gantt runtime alive while loading Calendar,
      // which Bryntum rejects as a duplicate Grid bundle. Start a fresh document
      // for this cross-product transition instead.
      window.location.assign(`/app/scheduling?${parameters}`);
    },
    [facilityAssignments],
  );
  const createFromCalendar = useCallback(
    (startDate: Date, endDate: Date, resourceId: string) => {
      if (!canManage || pending || calendarPending) return;
      try {
        const rowOrderId = resourceId.match(/^order:([^:]+)/)?.[1] ?? null;
        const orderId = rowOrderId ?? selectedOrderId;
        const order = orderId
          ? customerOrders.find((item) => item.id === orderId)
          : undefined;
        const customerId = order?.customerId
          ?? resourceId.match(/^customer:([^:]+)/)?.[1]
          ?? selectedCustomerId;
        const productIds = customerId ? (customerProductIds[customerId] ?? []) : [];
        const productionPlanResource = resourceId === 'unlinked-work'
          || resourceId.startsWith('customer:')
          || resourceId.startsWith('order:');
        const allDay = activeScheduleSurface === 'board' || productionPlanResource;
        const startDay = dateKey(startDate);
        const endDay = allDay ? dateKey(new Date(endDate.getTime() - 1)) : dateKey(endDate);
        const timeZone = facility?.timezone ?? 'UTC';
        openForm();
        setForm((current) => ({
          ...current,
          startAt: allDay
            ? facilityInputInstant(`${startDay}T00:00`, timeZone)
            : startDate.toISOString(),
          endAt: allDay
            ? facilityInputInstant(`${addDays(endDay, 1)}T00:00`, timeZone)
            : endDate.toISOString(),
          allDay,
          startDate: startDay,
          endDate: endDay,
          employeeIds: facilityEmployees.some((person) => person.id === resourceId)
            ? [resourceId]
            : [],
          customerId: customerId ?? null,
          productionPlanId: null,
          linkedTaskType: order ? 'order' : null,
          linkedTaskId: order?.id ?? null,
          productId: productIds.length === 1 ? (productIds[0] ?? null) : null,
          plannedBatchCount: order?.orderBatchCount ?? null,
        }));
      } catch (error) {
        console.error('scheduler.calendar-create-invalid', {
          code: error instanceof Error ? error.name : 'unknown',
        });
        setMessage(es ? 'Seleccione días completos válidos.' : 'Choose valid full calendar days.');
        resetCalendarFromLocalState();
      }
    },
    [
      canManage, pending, calendarPending, facilityEmployees, es, openForm, customerOrders,
      selectedCustomerId, selectedOrderId, activeScheduleSurface, facility,
      resetCalendarFromLocalState, customerProductIds,
    ],
  );
  function saveForm() {
    if (!canManage || pending || calendarPending) return;
    let input = form;
    if (form.allDay) {
      try {
        input = {
          ...form,
          startAt: facilityInputInstant(`${form.startDate}T00:00`, form.timeZone),
          endAt: facilityInputInstant(`${addDays(form.endDate, 1)}T00:00`, form.timeZone),
        };
      } catch (error) {
        setMessage(error instanceof Error ? error.message : 'Choose valid full calendar days.');
        return;
      }
    }
    if (
      !input.facilityId
      || !Number.isInteger(input.requiredWorkerCount)
      || input.requiredWorkerCount <= 0
      || !Number.isFinite(Date.parse(input.startAt))
      || !Number.isFinite(Date.parse(input.endAt))
      || input.endAt <= input.startAt
    ) {
      setMessage(
        es
          ? 'Seleccione un intervalo de fecha y hora válido.'
          : 'Choose a valid date and time range.',
      );
      return;
    }
    startTransition(async () => {
      let saved = false;
      try {
        const result = await persist(input, editingId ?? undefined);
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        setFormOpen(false);
        saved = true;
        setMessage(es ? 'Asignación guardada.' : 'Assignment saved.');
        router.refresh();
      } catch (error) {
        console.error('scheduler.form-save-failed', {
          code: error instanceof Error ? error.name : 'unknown',
        });
        setMessage(es ? 'No se pudo guardar. Vuelva a intentarlo.' : 'Could not save. Try again.');
      } finally {
        if (!saved) {
          resetCalendarFromLocalState();
          router.refresh();
        }
      }
    });
  }
  const deleteAssignment = useCallback(
    (id: string) => {
      if (!canManage || pending || calendarPending) return;
      startTransition(async () => {
        const previous = localAssignments.find((item) => item.id === id);
        if (!previous) return;
        let deleted = false;
        try {
          const result = await deleteScheduleEvent({
            id,
            facility_id: facilityId,
            revision: previous.revision,
          });
          if (!result.ok) {
            setMessage(result.message);
            return;
          }
          setFormOpen(false);
          setDeletingWorkId(null);
          deleted = true;
          setMessage(es ? 'Asignación eliminada.' : 'Assignment deleted.');
          router.refresh();
        } catch (error) {
          console.error('scheduler.form-delete-failed', {
            code: error instanceof Error ? error.name : 'unknown',
          });
          setMessage(
            es ? 'No se pudo eliminar. Vuelva a intentarlo.' : 'Could not delete. Try again.',
          );
        } finally {
          if (!deleted) {
            resetCalendarFromLocalState();
            router.refresh();
          }
        }
      });
    },
    [
      localAssignments, facilityId, es, router, canManage, pending, calendarPending,
      resetCalendarFromLocalState,
    ],
  );
  function applyPeriod() {
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      setMessage(es ? 'Seleccione un período válido.' : 'Choose a valid reporting period.');
      return;
    }
    const parameters = new URLSearchParams(scheduleParameters);
    parameters.set('start', periodStart);
    parameters.set('end', periodEnd);
    if (activeScheduleSurface === 'calendar') {
      parameters.set('surface', 'calendar');
    }
    if (activeScheduleSurface === 'staffing') {
      parameters.set('perspective', 'employee');
    }
    router.replace(`/app/scheduling?${parameters}`);
  }
  function resetPeriod() {
    setPeriodStart('');
    setPeriodEnd('');
    const parameters = new URLSearchParams(scheduleParameters);
    parameters.delete('start');
    parameters.delete('end');
    if (activeScheduleSurface === 'calendar') {
      parameters.set('surface', 'calendar');
    }
    if (activeScheduleSurface === 'staffing') {
      parameters.set('perspective', 'employee');
    }
    router.replace(`/app/scheduling${parameters.size ? `?${parameters}` : ''}`);
  }
  function publishDraft() {
    startTransition(async () => {
      const result = await publishSchedule({
        facility_id: facilityId,
        revision: publicationRevision,
      });
      if (result.ok) setMessage(es ? 'Horario publicado para el equipo.' : 'Schedule published for workers.');
      else setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  function savePto() {
    if (!ptoForm.employeeId || !ptoForm.ptoTypeId || ptoForm.endDate < ptoForm.startDate) {
      setMessage(
        es ? 'Seleccione empleado y fechas válidas.' : 'Choose an employee and valid dates.',
      );
      return;
    }
    startTransition(async () => {
      const result = await saveSchedulePto({
        id: ptoForm.id || crypto.randomUUID(),
        facility_id: facilityId,
        employee_id: ptoForm.employeeId,
        pto_type_id: ptoForm.ptoTypeId,
        revision: ptoForm.revision,
        start_on: ptoForm.startDate,
        end_on: addDays(ptoForm.endDate, 1),
        start_minute: ptoForm.startMinute,
        end_minute: ptoForm.endMinute,
        private_note: ptoForm.privateNote,
      });
      if (result.ok) setMessage(es ? 'Ausencia guardada.' : 'Time off saved.');
      else setMessage(result.message);
      if (result.ok) {
        setPtoOpen(false);
        router.refresh();
      }
    });
  }
  function cancelPto(block: PtoBlock) {
    startTransition(async () => {
      const result = await cancelSchedulePto({
        id: block.id,
        facility_id: facilityId,
        revision: block.revision,
      });
      if (result.ok) setMessage(es ? 'Ausencia cancelada.' : 'Time off cancelled.');
      else setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  function updateAvailability(employee: Employee, day: number) {
    const availableDays = employee.availableDays.includes(day)
      ? employee.availableDays.filter((value) => value !== day)
      : [...employee.availableDays, day].sort();
    startTransition(async () => {
      const result = await saveScheduleAvailability({
        facility_id: facilityId,
        employee_id: employee.id,
        available_days: availableDays,
      });
      if (result.ok) setMessage(es ? 'Disponibilidad guardada.' : 'Availability saved.');
      else setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  let publicationStatus = es
    ? 'Todavía no hay horario publicado.'
    : 'No schedule has been published yet.';
  if (publicationRevision) publicationStatus = `${es ? 'Versión publicada' : 'Published revision'} ${publicationRevision}`;
  function assignmentPublicationLabel(item: Assignment): string {
    const published = publishedAssignments.some((previous) => matchesPublishedWork(item, previous));
    if (published) return es ? 'Publicado' : 'Published';
    return es ? 'Borrador' : 'Draft';
  }
  let dialogTitle = es ? 'Crear orden de trabajo' : 'Create Work Order';
  if (editingId) dialogTitle = es ? 'Editar trabajo' : 'Edit work';
  else if (duplicatingId) dialogTitle = es ? 'Duplicar trabajo' : 'Duplicate work';
  let assignmentDialogDescription = es
    ? 'Seleccione la tarea, las fechas y los empleados para esta asignación.'
    : 'Choose the task, dates, and employees for this assignment.';
  if (!form.allDay) {
    assignmentDialogDescription = es
      ? 'Seleccione la tarea, las fechas, las horas y los empleados para esta asignación.'
      : 'Choose the task, dates, times, and employees for this assignment.';
  }
  if (duplicatingId) {
    assignmentDialogDescription = es
      ? 'Elija otro día de destino. La asignación original no cambiará.'
      : 'Choose another target day. The original assignment will not change.';
  }
  const selectCustomer = (customerId: string) => {
    setSelectedCustomerId(customerId || null);
    setSelectedOrderId(null);
  };
  const selectOrder = (orderId: string) => {
    const order = customerOrders.find((item) => item.id === orderId);
    setSelectedOrderId(order?.id ?? null);
    setSelectedCustomerId(order?.customerId ?? null);
  };
  const clearOrderFocus = () => {
    setSelectedCustomerId(null);
    setSelectedOrderId(null);
  };

  return (
    <div className={styles.workspace} data-schedule-expanded={scheduleExpanded}>
      <p className={styles.publication}>
        {publicationStatus}
        {' · '}
        {es
          ? 'Los cambios de borrador aparecen a los trabajadores al publicar.'
          : 'Draft changes reach workers when you publish.'}
      </p>
      {!facilities.length && (
        <p>{es ? 'No hay instalaciones disponibles.' : 'No facilities are available.'}</p>
      )}
      {facilities.length > 0 && (
        <>
          <div className={styles.layout}>
            <aside
              className={styles.sidebar}
              aria-label={es ? 'Personal y producción' : 'Staffing and production'}
            >
              <h2>{es ? 'Personal' : 'Staffing'}</h2>
              <p>
                {es
                  ? 'Seleccione una o más personas para enfocar el calendario y rellenar una nueva asignación.'
                  : 'Select one or more people to focus the calendar and prefill a new assignment.'}
              </p>
              <p>
                {es
                  ? 'La menor utilización aparece primero para ayudar a equilibrar el trabajo.'
                  : 'Least utilized appears first to help balance work.'}
              </p>
              <div className={styles.peopleControls}>
                <input
                  aria-label={es ? 'Buscar empleados' : 'Search employees'}
                  placeholder={es ? 'Buscar' : 'Search'}
                  value={employeeSearch}
                  onChange={(event) => setEmployeeSearch(event.target.value)}
                />
                <select
                  aria-label={es ? 'Ordenar empleados' : 'Sort employees'}
                  value={sortPeople}
                  onChange={(event) => {
                    const { value } = event.target;
                    if (value === 'least' || value === 'most' || value === 'name') setSortPeople(value);
                  }}
                >
                  <option value="least">{es ? 'Menor utilización' : 'Least utilized'}</option>
                  <option value="most">{es ? 'Mayor utilización' : 'Most utilized'}</option>
                  <option value="name">{es ? 'Nombre' : 'Name'}</option>
                </select>
                <button type="button" onClick={() => setSelectedEmployees([])}>
                  {es ? 'Ver todos' : 'Show all'}
                </button>
              </div>
              <div className={styles.employeeList}>
                {peopleForPanel.map((person) => (
                  <button
                    key={person.id}
                    type="button"
                    className={styles.personOption}
                    aria-pressed={selectedEmployees.includes(person.id)}
                    onClick={() => setSelectedEmployees((current) => (current.includes(person.id)
                      ? current.filter((id) => id !== person.id)
                      : [...current, person.id]))}
                  >
                    <span className={styles.personName}>{person.name}</span>
                    <span className={styles.utilization}>
                      {utilization.get(person.id)?.hours.toFixed(1)}
                      h ·
                      {' '}
                      {utilization.get(person.id)?.percent}
                      %
                    </span>
                  </button>
                ))}
                {!facilityEmployees.length && (
                  <p>
                    {es
                      ? 'No hay empleados en esta instalación.'
                      : 'No employees at this facility.'}
                  </p>
                )}
              </div>
              <h2>{es ? 'Producción planificada' : 'Production plan'}</h2>
              <p>
                {es
                  ? 'Estas fechas son una referencia; se permiten tareas fuera de ellas.'
                  : 'These dates are a guide; work can be scheduled outside them.'}
              </p>
              <ul className={styles.bands}>
                {relevantBands.map((band) => (
                  <li key={band.id}>
                    <strong>{band.label}</strong>
                    <span>
                      {band.startDate}
                      {' '}
                      –
                      {band.endDate}
                    </span>
                  </li>
                ))}
                {!relevantBands.length && (
                  <li>
                    {es
                      ? 'No hay fechas de producción en este período.'
                      : 'No production dates in this period.'}
                  </li>
                )}
              </ul>
            </aside>
            <div
              ref={calendarRef}
              id="schedule-calendar"
              className={`${styles.calendar}${scheduleExpanded ? ` ${styles.calendarExpanded}` : ''}`}
              aria-label={es ? 'Calendario de semana laboral' : 'Workweek calendar'}
            >
              {trialPresentation ? (
                <>
                  <div
                    className={styles.calendarControls}
                    aria-label={es ? 'Controles del calendario' : 'Calendar controls'}
                  >
                    <div
                      className={styles.orderFocus}
                      role="group"
                      aria-label={es ? 'Enfoque del calendario' : 'Calendar focus'}
                    >
                      <span className={styles.orderFocusLabel}>
                        {es ? 'Mostrar para' : 'Show for'}
                      </span>
                      <label>
                        {es ? 'Cliente' : 'Customer'}
                        <select
                          value={selectedCustomerId ?? ''}
                          onChange={(event) => selectCustomer(event.target.value)}
                        >
                          <option value="">{es ? 'Todos los clientes' : 'All customers'}</option>
                          {customers.map((customer) => (
                            <option key={customer.id} value={customer.id}>
                              {customer.name}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label>
                        {es ? 'Pedido' : 'Order'}
                        <select
                          value={selectedOrderId ?? ''}
                          onChange={(event) => selectOrder(event.target.value)}
                        >
                          <option value="">{es ? 'Todos los pedidos' : 'All orders'}</option>
                          {availableOrders.map((order) => (
                            <option
                              key={order.id}
                              value={order.id}
                            >
                              {`${order.customerName} · ${order.reference || order.id.slice(0, 8)}`}
                            </option>
                          ))}
                        </select>
                      </label>
                      {selectedCustomerId || selectedOrderId ? (
                        <button
                          type="button"
                          className={styles.clearOrderFocus}
                          onClick={clearOrderFocus}
                        >
                          {es ? 'Mostrar todo' : 'Show all'}
                        </button>
                      ) : null}
                    </div>
                    <div
                      className={styles.surfaceToggle}
                      aria-label={es ? 'Superficie de programación' : 'Scheduling surface'}
                    >
                      <a
                        href={productionPlanHref}
                        className={
                          activeScheduleSurface === 'board' ? styles.surfaceSelected : undefined
                        }
                        aria-current={activeScheduleSurface === 'board' ? 'page' : undefined}
                      >
                        {es ? 'Plan de producción' : 'Production plan'}
                      </a>
                      <a
                        href={executionCalendarHref}
                        className={
                          activeScheduleSurface === 'calendar' ? styles.surfaceSelected : undefined
                        }
                        aria-current={activeScheduleSurface === 'calendar' ? 'page' : undefined}
                      >
                        {es ? 'Calendario de ejecución' : 'Execution calendar'}
                      </a>
                    </div>
                    <div className={styles.calendarActions}>
                      <button
                        ref={expandButtonRef}
                        type="button"
                        aria-pressed={scheduleExpanded}
                        aria-controls="schedule-calendar"
                        onClick={() => setScheduleExpanded((expanded) => !expanded)}
                        title={scheduleExpanded ? exitExpandedScheduleHint : undefined}
                      >
                        {scheduleExpanded ? exitExpandedScheduleLabel : expandScheduleLabel}
                      </button>
                    </div>
                    {canManage && (
                      <div className={styles.calendarActions}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => {
                            rememberDialogOpener();
                            setPtoForm({
                              id: '',
                              employeeId: facilityEmployees[0]?.id ?? '',
                              ptoTypeId: ptoTypes.find((type) => type.active)?.id ?? '',
                              startDate: activeDate,
                              endDate: activeDate,
                              startMinute: 0,
                              endMinute: 1440,
                              privateNote: '',
                              revision: 0,
                            });
                            setPtoOpen(true);
                          }}
                        >
                          {es ? 'Registrar ausencia' : 'Record time off'}
                        </button>
                        <button
                          type="button"
                          className={styles.publish}
                          disabled={pending}
                          onClick={publishDraft}
                        >
                          {es ? 'Publicar semana' : 'Publish week'}
                        </button>
                      </div>
                    )}
                  </div>
                  {activeScheduleSurface === 'board' && (
                    <BryntumGantt
                      data={trialPresentation}
                      startDate={defaultStart}
                      endDate={defaultEndExclusive}
                      planStartDate={planStartDate}
                      locale={locale}
                      canManage={canManage}
                      pending={
                        pending || calendarPending || formOpen || ptoOpen || Boolean(summaryEventId)
                      }
                      resetVersion={calendarResetVersion}
                      focusedWorkId={initialWorkId}
                      onAddWork={() => openForm()}
                      onEventSummary={(id) => {
                        rememberDialogOpener();
                        setSummaryEventId(id);
                      }}
                      onEdit={editAssignment}
                      onDuplicate={duplicateAssignment}
                      onDelete={setDeletingWorkId}
                      onViewExecutionSchedule={viewExecutionSchedule}
                      onCreate={createFromCalendar}
                      onDateChange={changeCalendarDates}
                    />
                  )}
                  {activeScheduleSurface === 'staffing' && (
                    <BryntumScheduler
                      data={trialPresentation}
                      startDate={defaultStart}
                      endDate={defaultEndExclusive}
                      planStartDate={planStartDate}
                      locale={locale}
                      canManage={canManage}
                      pending={
                        pending || calendarPending || formOpen || ptoOpen || Boolean(summaryEventId)
                      }
                      resetVersion={calendarResetVersion}
                      focusedWorkId={initialWorkId}
                      onAddWork={() => openForm()}
                      onEventSummary={(id) => {
                        rememberDialogOpener();
                        setSummaryEventId(id);
                      }}
                      onEdit={editAssignment}
                      onDuplicate={duplicateAssignment}
                      onViewExecutionSchedule={viewExecutionSchedule}
                      onCreate={createFromCalendar}
                      onDateChange={changeCalendarDates}
                    />
                  )}
                  {activeScheduleSurface === 'calendar' && (
                    <BryntumCalendar
                      data={trialPresentation}
                      startDate={defaultStart}
                      endDate={defaultEndExclusive}
                      planStartDate={planStartDate}
                      locale={locale}
                      canManage={canManage}
                      pending={
                        pending || calendarPending || formOpen || ptoOpen || Boolean(summaryEventId)
                      }
                      resetVersion={calendarResetVersion}
                      focusedWorkId={initialWorkId}
                      onAddWork={() => openForm()}
                      onEventSummary={(id) => {
                        rememberDialogOpener();
                        setSummaryEventId(id);
                      }}
                      onEdit={editAssignment}
                      onDuplicate={duplicateAssignment}
                      onViewExecutionSchedule={viewExecutionSchedule}
                      onCreate={createFromCalendar}
                      onDateChange={changeCalendarDates}
                    />
                  )}
                </>
              ) : (
                <p role="alert">
                  {es ? 'No se pudo preparar el horario.' : 'The schedule could not be prepared.'}
                </p>
              )}
            </div>
          </div>
          <section className={styles.summary} aria-labelledby="scheduler-summary-heading">
            <div className={styles.summaryHeader}>
              <div>
                <h2 id="scheduler-summary-heading">{es ? 'Utilización' : 'Utilization'}</h2>
                <p>
                  {es
                    ? 'Días por empleado; un día equivale a la capacidad semanal dividida entre cinco.'
                    : 'Days per employee; one day equals weekly capacity divided by five.'}
                </p>
              </div>
              <div className={styles.periodFields}>
                <label>
                  {es ? 'Desde' : 'From'}
                  <input
                    type="date"
                    value={periodStart}
                    onChange={(event) => setPeriodStart(event.target.value)}
                  />
                </label>
                <label>
                  {es ? 'Hasta' : 'Through'}
                  <input
                    type="date"
                    value={periodEnd}
                    onChange={(event) => setPeriodEnd(event.target.value)}
                  />
                </label>
                <button type="button" onClick={applyPeriod}>
                  {es ? 'Aplicar período' : 'Apply period'}
                </button>
                <button type="button" onClick={resetPeriod}>
                  {es ? 'Vista actual' : 'Current view'}
                </button>
              </div>
            </div>
            {!reportValid && (
              <p role="alert">
                {es
                  ? 'La fecha final debe ser posterior a la inicial.'
                  : 'The end date must follow the start date.'}
              </p>
            )}
            {reportValid && (
              <div className={styles.tableScroll}>
                <table>
                  <caption>
                    {reportStart}
                    {' '}
                    –
                    {addDays(reportEndExclusive, -1)}
                    {' '}
                    ·
                    {' '}
                    {es ? 'capacidad' : 'capacity'}
                    {' '}
                    {facility?.weeklyHours ?? 40}
                    {' '}
                    h/
                    {es ? 'semana' : 'week'}
                  </caption>
                  <thead>
                    <tr>
                      <th scope="col">{es ? 'Empleado' : 'Employee'}</th>
                      <th scope="col">{es ? 'Horas' : 'Hours'}</th>
                      <th scope="col">%</th>
                      {types.map((type) => (
                        <th key={type} scope="col">
                          {labels[locale][type]}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {displayedEmployees.map((person) => {
                      const datesByType: Record<WorkType, Set<string>> = {
                        mixing: new Set(),
                        ingredient_prep: new Set(),
                        receiving: new Set(),
                        shipment_loading: new Set(),
                        packaging: new Set(),
                        pre_op: new Set(),
                        post_op: new Set(),
                        cleaning: new Set(),
                        other: new Set(),
                        off: new Set(),
                      };
                      const scheduledDates = new Set<string>();
                      facilityAssignments
                        .filter((item) => item.employeeIds.includes(person.id))
                        .forEach((item) => {
                          assignmentDates(item, reportStart, reportEndExclusive).forEach((date) => {
                            datesByType[item.type].add(date);
                            if (item.type !== 'off') scheduledDates.add(date);
                          });
                        });
                      const hours = (scheduledDates.size * (facility?.weeklyHours ?? 40)) / 5;
                      return (
                        <tr key={person.id}>
                          <th scope="row">{person.name}</th>
                          <td>{hours.toFixed(1)}</td>
                          <td>
                            {capacityHours ? Math.round((hours / capacityHours) * 100) : 0}
                            %
                          </td>
                          {types.map((type) => (
                            <td key={type}>{datesByType[type].size}</td>
                          ))}
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
          <section className={styles.assignments} aria-labelledby="assignments-heading">
            <h2 id="assignments-heading">{es ? 'Asignaciones visibles' : 'Visible assignments'}</h2>
            <ul>
              {facilityAssignments
                .filter(
                  (item) => (
                    !item.employeeIds.length || item.employeeIds.some((id) => shownIds.has(id))
                  )
                    && item.startDate < reportEndExclusive
                    && item.endDate >= reportStart,
                )
                .map((item) => (
                  <li key={item.id}>
                    <span>
                      <strong>{labels[locale][item.type]}</strong>
                      {' '}
                      ·
                      {item.startDate}
                      {item.endDate !== item.startDate ? ` – ${item.endDate}` : ''}
                      {' '}
                      ·
                      {item.employeeIds
                        .map((id) => facilityEmployees.find((person) => person.id === id)?.name)
                        .filter(Boolean)
                        .join(', ')}
                      {!item.employeeIds.length && (es ? 'Sin asignar' : 'Unassigned')}
                      {' · '}
                      {assignmentPublicationLabel(item)}
                    </span>
                    {overlappingIds.has(item.id) && (
                      <span className={styles.warning}>
                        ⚠
                        {es ? 'Coincide con otra asignación' : 'Overlaps another assignment'}
                      </span>
                    )}
                    {canManage && (
                      <button type="button" onClick={() => openForm(item)}>
                        {es ? 'Editar' : 'Edit'}
                      </button>
                    )}
                  </li>
                ))}
            </ul>
          </section>
          <section className={styles.assignments} aria-labelledby="published-heading">
            <h2 id="published-heading">
              {es ? 'Horario visible para trabajadores' : 'Worker-visible schedule'}
            </h2>
            <ul>
              {publishedAssignments
                .filter(
                  (item) => item.startDate < reportEndExclusive && item.endDate >= reportStart,
                )
                .map((item) => (
                  <li key={item.id}>
                    <strong>{item.note || labels[locale][item.type]}</strong>
                    <span>
                      {item.startDate}
                      {' '}
                      –
                      {item.endDate}
                    </span>
                    <span>
                      {item.employeeIds
                        .map((id) => facilityEmployees.find((person) => person.id === id)?.name)
                        .filter(Boolean)
                        .join(', ') || (es ? 'Sin asignar' : 'Unassigned')}
                    </span>
                  </li>
                ))}
              {!publishedAssignments.length && (
                <li>
                  {es ? 'Todavía no hay asignaciones publicadas.' : 'No assignments published yet.'}
                </li>
              )}
            </ul>
          </section>
          <section className={styles.assignments} aria-labelledby="pto-heading">
            <h2 id="pto-heading">
              {es ? 'Ausencias y disponibilidad' : 'Time off and availability'}
            </h2>
            <ul>
              {pto.map((block) => (
                <li key={block.id}>
                  <span>
                    {facilityEmployees.find((person) => person.id === block.employeeId)?.name}
                    {' · '}
                    {block.startDate}
                    {' '}
                    –
                    {block.endDate}
                    {block.startMinute !== 0 || block.endMinute !== 1440
                      ? ` · ${String(Math.floor(block.startMinute / 60)).padStart(2, '0')}:${String(block.startMinute % 60).padStart(2, '0')}–${String(Math.floor(block.endMinute / 60)).padStart(2, '0')}:${String(block.endMinute % 60).padStart(2, '0')}`
                      : ''}
                  </span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        rememberDialogOpener();
                        setPtoForm(block);
                        setPtoOpen(true);
                      }}
                    >
                      {es ? 'Editar' : 'Edit'}
                    </button>
                  )}
                  {canManage && (
                    <button type="button" disabled={pending} onClick={() => cancelPto(block)}>
                      {es ? 'Cancelar' : 'Cancel'}
                    </button>
                  )}
                </li>
              ))}
            </ul>
            {canManage
              && facilityEmployees.map((person) => (
                <fieldset key={person.id} className={styles.availability}>
                  <legend>{person.name}</legend>
                  {['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].map((dayLabel, day) => (
                    <label key={`${person.id}-${dayLabel}`}>
                      <input
                        type="checkbox"
                        disabled={pending}
                        checked={person.availableDays.includes(day)}
                        onChange={() => updateAvailability(person, day)}
                      />
                      {es ? ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'][day] : dayLabel}
                    </label>
                  ))}
                </fieldset>
              ))}
          </section>
        </>
      )}
      {message && !formOpen && (
        <p role="status" className={styles.status}>
          {message}
        </p>
      )}
      {ptoOpen && canManage && (
        <div className={styles.modalBackdrop}>
          <section
            ref={dialogRef}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="pto-dialog-title"
            aria-describedby="pto-dialog-description"
            tabIndex={-1}
          >
            <h2 id="pto-dialog-title">{es ? 'Ausencia del empleado' : 'Employee time off'}</h2>
            <label>
              {es ? 'Empleado' : 'Employee'}
              <select
                value={ptoForm.employeeId}
                onChange={(event) => setPtoForm({ ...ptoForm, employeeId: event.target.value })}
              >
                {facilityEmployees.map((person) => (
                  <option key={person.id} value={person.id}>
                    {person.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              {es ? 'Tipo de ausencia' : 'Time-off type'}
              <select
                value={ptoForm.ptoTypeId}
                onChange={(event) => setPtoForm({ ...ptoForm, ptoTypeId: event.target.value })}
              >
                <option value="" disabled>
                  {es ? 'Seleccione un tipo' : 'Select a type'}
                </option>
                {ptoTypes
                  .filter((type) => type.active || type.id === ptoForm.ptoTypeId)
                  .map((type) => (
                    <option key={type.id} value={type.id}>
                      {type.name}
                    </option>
                  ))}
              </select>
            </label>
            <div className={styles.dates}>
              <label>
                {es ? 'Desde' : 'From'}
                <input
                  type="date"
                  value={ptoForm.startDate}
                  onChange={(event) => setPtoForm({ ...ptoForm, startDate: event.target.value })}
                />
              </label>
              <label>
                {es ? 'Hasta' : 'Through'}
                <input
                  type="date"
                  value={ptoForm.endDate}
                  onChange={(event) => setPtoForm({ ...ptoForm, endDate: event.target.value })}
                />
              </label>
              <label>
                {es ? 'Hora inicial' : 'Start time'}
                <input
                  type="time"
                  value={`${String(Math.floor(ptoForm.startMinute / 60)).padStart(2, '0')}:${String(ptoForm.startMinute % 60).padStart(2, '0')}`}
                  onChange={(event) => {
                    const [hour = 0, minute = 0] = event.target.value.split(':').map(Number);
                    setPtoForm({ ...ptoForm, startMinute: hour * 60 + minute });
                  }}
                />
              </label>
              <label>
                {es ? 'Hora final' : 'End time'}
                <input
                  type="time"
                  value={
                    ptoForm.endMinute === 1440
                      ? '23:59'
                      : `${String(Math.floor(ptoForm.endMinute / 60)).padStart(2, '0')}:${String(ptoForm.endMinute % 60).padStart(2, '0')}`
                  }
                  onChange={(event) => {
                    const [hour = 0, minute = 0] = event.target.value.split(':').map(Number);
                    setPtoForm({ ...ptoForm, endMinute: hour * 60 + minute });
                  }}
                />
              </label>
            </div>
            <p id="pto-dialog-description">
              {es
                ? 'Para días completos, deje las horas sin cambios.'
                : 'For full days, leave the times unchanged.'}
            </p>
            <label>
              {es ? 'Nota privada' : 'Private note'}
              <textarea
                value={ptoForm.privateNote}
                onChange={(event) => setPtoForm({ ...ptoForm, privateNote: event.target.value })}
              />
            </label>
            <div className={styles.dialogActions}>
              <button type="button" disabled={pending} onClick={() => setPtoOpen(false)}>
                {es ? 'Cerrar' : 'Close'}
              </button>
              <button type="button" className={styles.primary} disabled={pending} onClick={savePto}>
                {es ? 'Guardar ausencia' : 'Save time off'}
              </button>
            </div>
          </section>
        </div>
      )}
      {formOpen && canManage && (
        <div className={styles.modalBackdrop}>
          <section
            ref={dialogRef}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="assignment-dialog-title"
            aria-describedby="assignment-dialog-description"
            tabIndex={-1}
          >
            <h2 id="assignment-dialog-title">{dialogTitle}</h2>
            <p id="assignment-dialog-description">{assignmentDialogDescription}</p>
            <label>
              {es ? 'Tarea' : 'Task'}
              <select
                value={form.type}
                onChange={(event) => {
                  const type = types.find((item) => item === event.target.value);
                  if (type) setForm({ ...form, type });
                }}
              >
                {types.map((type) => (
                  <option key={type} value={type}>
                    {labels[locale][type]}
                  </option>
                ))}
              </select>
            </label>
            <div className={styles.dates}>
              {form.allDay ? (
                <>
                  <label>
                    {es ? 'Fecha de inicio' : 'Start date'}
                    <input
                      type="date"
                      value={form.startDate}
                      onChange={(event) => {
                        try {
                          const startDate = event.target.value;
                          setForm({
                            ...form,
                            startDate,
                            startAt: facilityInputInstant(`${startDate}T00:00`, form.timeZone),
                          });
                          setMessage('');
                        } catch (error) {
                          setMessage(
                            error instanceof Error ? error.message : 'Choose a valid date.',
                          );
                        }
                      }}
                    />
                  </label>
                  <label>
                    {es ? 'Fecha de fin' : 'End date'}
                    <input
                      type="date"
                      value={form.endDate}
                      onChange={(event) => {
                        try {
                          const endDate = event.target.value;
                          setForm({
                            ...form,
                            endDate,
                            endAt: facilityInputInstant(
                              `${addDays(endDate, 1)}T00:00`,
                              form.timeZone,
                            ),
                          });
                          setMessage('');
                        } catch (error) {
                          setMessage(
                            error instanceof Error ? error.message : 'Choose a valid date.',
                          );
                        }
                      }}
                    />
                  </label>
                </>
              ) : (
                <>
                  <label>
                    {es ? 'Inicio' : 'Start'}
                    <input
                      type="datetime-local"
                      value={facilityInputValue(form.startAt, form.timeZone)}
                      onChange={(event) => {
                        try {
                          const startAt = facilityInputInstant(event.target.value, form.timeZone);
                          setForm({ ...form, startAt, startDate: event.target.value.slice(0, 10) });
                          setMessage('');
                        } catch (error) {
                          setMessage(
                            error instanceof Error ? error.message : 'Choose a valid local time.',
                          );
                        }
                      }}
                    />
                  </label>
                  <label>
                    {es ? 'Fin' : 'End'}
                    <input
                      type="datetime-local"
                      value={facilityInputValue(form.endAt, form.timeZone)}
                      onChange={(event) => {
                        try {
                          const endAt = facilityInputInstant(event.target.value, form.timeZone);
                          setForm({ ...form, endAt, endDate: event.target.value.slice(0, 10) });
                          setMessage('');
                        } catch (error) {
                          setMessage(
                            error instanceof Error ? error.message : 'Choose a valid local time.',
                          );
                        }
                      }}
                    />
                  </label>
                </>
              )}
            </div>
            <label>
              {es ? 'Trabajadores necesarios' : 'Workers needed'}
              <input
                type="number"
                min="1"
                max="100"
                step="1"
                required
                value={form.requiredWorkerCount}
                onChange={(event) => setForm({
                  ...form,
                  requiredWorkerCount: Number(event.target.value),
                })}
              />
            </label>
            <fieldset>
              <legend>{es ? 'Empleados' : 'Employees'}</legend>
              <div className={styles.employeeList}>
                {facilityEmployees.map((person) => {
                  const detail = employeeSchedulingDetails(person);
                  const scheduled = employeeHasConflictingAssignment(
                    person.id,
                    form,
                    facilityAssignments,
                    editingId ?? undefined,
                  );
                  return (
                    <label key={person.id} className={detail ? styles.employeeConflict : undefined}>
                      <input
                        type="checkbox"
                        checked={form.employeeIds.includes(person.id)}
                        disabled={scheduled && !form.employeeIds.includes(person.id)}
                        onChange={(event) => setForm({
                          ...form,
                          employeeIds: event.target.checked
                            ? [...form.employeeIds, person.id]
                            : form.employeeIds.filter((id) => id !== person.id),
                        })}
                      />
                      <span>{person.name}</span>
                      {detail && <span className={styles.employeeConflictDetail}>{detail}</span>}
                    </label>
                  );
                })}
              </div>
            </fieldset>
            <fieldset className={styles.orderContext}>
              <legend>{es ? 'Pedido del cliente' : 'Customer order'}</legend>
              <p className={styles.fieldHelp}>
                {es
                  ? 'Elija el cliente y luego el producto pedido para este trabajo.'
                  : 'Choose the customer, then the ordered product this work supports.'}
              </p>
              <label>
                {es ? 'Cliente' : 'Customer'}
                <select
                  value={form.customerId ?? ''}
                  onChange={(event) => {
                    const customerId = event.target.value || null;
                    const productIds = customerId ? (customerProductIds[customerId] ?? []) : [];
                    setForm({
                      ...form,
                      customerId,
                      productId: productIds.length === 1 ? (productIds[0] ?? null) : null,
                      productionPlanId: null,
                      linkedTaskType: null,
                      linkedTaskId: null,
                    });
                  }}
                >
                  <option value="">{es ? 'Sin cliente' : 'No customer'}</option>
                  {customers.map((customer) => (
                    <option key={customer.id} value={customer.id}>
                      {customer.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {es ? 'Pedido' : 'Order'}
                <select
                  value={form.linkedTaskType === 'order' ? form.linkedTaskId ?? '' : ''}
                  disabled={!form.customerId}
                  onChange={(event) => {
                    const order = customerOrders.find((item) => item.id === event.target.value);
                    setForm({
                      ...form,
                      customerId: order?.customerId ?? form.customerId,
                      productionPlanId: null,
                      linkedTaskType: order ? 'order' : null,
                      linkedTaskId: order?.id ?? null,
                    });
                  }}
                >
                  <option value="">{es ? 'Sin pedido' : 'No order'}</option>
                  {selectableOrders.map((order) => (
                    <option key={order.id} value={order.id}>
                      {order.reference || (es ? 'Pedido sin referencia' : 'Order without reference')}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                {es ? 'Producto pedido' : 'Ordered product'}
                <select
                  value={form.productId ?? ''}
                  disabled={!form.customerId}
                  onChange={(event) => setForm({ ...form, productId: event.target.value || null })}
                >
                  <option value="">{form.customerId ? noProductLabel : selectCustomerLabel}</option>
                  {selectableProducts.map((product) => (
                    <option key={product.id} value={product.id}>
                      {product.name}
                    </option>
                  ))}
                </select>
                {form.customerId && !selectableProducts.length && (
                  <span className={styles.fieldHelp}>
                    {es
                      ? 'Este cliente aún no tiene productos pedidos.'
                      : 'This customer has no ordered products.'}
                  </span>
                )}
              </label>
            </fieldset>
            <details className={styles.relatedWork}>
              <summary>
                {es ? 'Vincular trabajo planificado (opcional)' : 'Link planned work (optional)'}
              </summary>
              <p className={styles.fieldHelp}>
                {es
                  ? 'Use esto solo si este trabajo corresponde a un lote o preparación ya planificada.'
                  : 'Use this only when this work belongs to an already planned batch or preparation.'}
              </p>
              <label>
                {es ? 'Trabajo planificado' : 'Planned work'}
                <select
                  value={
                    form.linkedTaskType && form.linkedTaskId
                      ? `${form.linkedTaskType}:${form.linkedTaskId}`
                      : ''
                  }
                  onChange={(event) => {
                    const selected = linkedTasks.find(
                      (task) => `${task.type}:${task.id}` === event.target.value,
                    );
                    setForm({
                      ...form,
                      productionPlanId: selected?.productionPlanId ?? null,
                      linkedTaskType: selected?.type ?? null,
                      linkedTaskId: selected?.id ?? null,
                    });
                  }}
                >
                  <option value="">{es ? 'Sin trabajo planificado' : 'No planned work'}</option>
                  {linkedTasks.map((task) => (
                    <option key={`${task.type}:${task.id}`} value={`${task.type}:${task.id}`}>
                      {task.label}
                    </option>
                  ))}
                </select>
              </label>
            </details>
            <label>
              {es ? 'Detalles del trabajo' : 'Work details'}
              <textarea
                value={form.note ?? ''}
                maxLength={120}
                onChange={(event) => setForm({ ...form, note: event.target.value || null })}
              />
            </label>
            {conflictsFor(form, facilityAssignments, editingId ?? undefined).length > 0 && (
              <p className={styles.warning} role="status">
                ⚠
                {es
                  ? 'Hay un conflicto de asignación. Cambie el empleado o las fechas antes de guardar.'
                  : 'Assignment conflict. Change the employee or dates before saving.'}
              </p>
            )}
            {message && (
              <p className={styles.warning} role="alert">
                {message}
              </p>
            )}
            <div className={styles.dialogActions}>
              {editingId && (
                <button
                  type="button"
                  disabled={pending}
                  onClick={() => deleteAssignment(editingId)}
                >
                  {es ? 'Eliminar' : 'Delete'}
                </button>
              )}
              <button type="button" disabled={pending} onClick={() => setFormOpen(false)}>
                {es ? 'Cancelar' : 'Cancel'}
              </button>
              <button
                type="button"
                className={styles.primary}
                disabled={pending}
                onClick={saveForm}
              >
                {es ? 'Guardar' : 'Save'}
              </button>
            </div>
          </section>
        </div>
      )}
      {eventSummary && (
        <div className={styles.modalBackdrop}>
          <section
            ref={dialogRef}
            className={styles.modal}
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-summary-title"
            tabIndex={-1}
          >
            <h2 id="calendar-summary-title">{eventSummary.title}</h2>
            <dl className={styles.summaryDetails}>
              {eventSummary.details.map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{value}</dd>
                </div>
              ))}
            </dl>
            <div className={styles.dialogActions}>
              {summaryAssignment && canManage && (
                <button
                  type="button"
                  onClick={() => {
                    setSummaryEventId(null);
                    openForm(summaryAssignment);
                  }}
                >
                  {es ? 'Ajustar horario' : 'Adjust time'}
                </button>
              )}
              <button type="button" onClick={() => setSummaryEventId(null)}>
                {es ? 'Cerrar' : 'Close'}
              </button>
            </div>
          </section>
        </div>
      )}
      <ConfirmDialog
        open={Boolean(deletingWorkId)}
        title={es ? 'Eliminar orden de trabajo' : 'Delete work order'}
        description={es
          ? 'Se eliminará este trabajo del plan y del calendario de ejecución.'
          : 'This work will be removed from the plan and execution calendar.'}
        confirmLabel={es ? 'Eliminar' : 'Delete'}
        cancelLabel={es ? 'Cancelar' : 'Cancel'}
        pending={pending}
        onCancel={() => setDeletingWorkId(null)}
        onConfirm={() => {
          if (deletingWorkId) deleteAssignment(deletingWorkId);
        }}
      />
    </div>
  );
}
