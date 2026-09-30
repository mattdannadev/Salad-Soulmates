'use client';

import {
  useCallback, useEffect, useMemo, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { EventCalendar } from '@mui/x-scheduler/event-calendar';
import type { SchedulerEvent } from '@mui/x-scheduler/models';
import { esES } from '@mui/x-scheduler/locales';
import { createTheme, ThemeProvider } from '@mui/material/styles';
import { enUS, es as esLocale } from 'date-fns/locale';
import {
  cancelSchedulePto, deleteScheduleEvent, publishSchedule, saveFacilitySchedulingSettings,
  saveScheduleAvailability, saveScheduleEvent, saveSchedulePto,
} from '@/app/app/scheduling/actions';
import { matchesPublishedWork } from '@/domain/scheduling';
import SchedulerWorkQueue from './scheduler-work-queue';
import styles from './scheduler.module.css';

export type WorkType = 'mixing' | 'ingredient_prep' | 'receiving' | 'shipment_loading'
  | 'packaging' | 'pre_op' | 'post_op' | 'cleaning' | 'other' | 'off';
export interface Facility { id: string; name: string; weeklyHours: number }
export interface Employee { id: string; name: string; facilityId: string; availableDays: number[] }
export interface Assignment {
  id: string;
  revision: number;
  facilityId: string;
  startDate: string;
  endDate: string; // Inclusive business date.
  type: WorkType;
  employeeIds: string[];
  note: string | null;
  productionPlanId: string | null;
  linkedTaskType: 'production_plan' | 'order' | 'purchase_draft' | 'planned_mixer_batch'
    | 'planned_spice_preparation' | 'production_lot' | null;
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
  startDate: string;
  endDate: string;
  startMinute: number;
  endMinute: number;
  privateNote: string;
  revision: number;
}
export interface PtoType { id: string; name: string; color: string; active: boolean }
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
  publishedAssignments: Pick<Assignment, 'id' | 'startDate' | 'endDate' | 'employeeIds'
    | 'type' | 'note' | 'productionPlanId' | 'linkedTaskType' | 'linkedTaskId'
    | 'productId' | 'customerId' | 'locationLabel'>[];
  publicationRevision: number;
  pto: PtoBlock[];
  ptoTypes: PtoType[];
  productionBands: ProductionBand[];
  linkedTasks: LinkedTaskOption[];
  products: { id: string; name: string }[];
  customers: { id: string; name: string }[];
  canManage: boolean;
  canManageSettings: boolean;
  initialPeriodStart?: string;
  initialPeriodEnd?: string;
}

const types: WorkType[] = ['pre_op', 'receiving', 'ingredient_prep', 'mixing', 'packaging', 'shipment_loading', 'post_op', 'cleaning', 'other', 'off'];
const colors: Record<WorkType, NonNullable<SchedulerEvent['color']>> = {
  mixing: 'teal', ingredient_prep: 'orange', receiving: 'blue', shipment_loading: 'purple', packaging: 'green', pre_op: 'grey', post_op: 'grey', cleaning: 'blue', other: 'purple', off: 'grey',
};
const productionColor: NonNullable<SchedulerEvent['color']> = 'green';
const labels: Record<'en' | 'es', Record<WorkType, string>> = {
  en: {
    mixing: 'Mixing', ingredient_prep: 'Ingredient prep', receiving: 'Receive delivery', shipment_loading: 'Load pickup', packaging: 'Packaging', pre_op: 'Pre-Op', post_op: 'Post-Op', cleaning: 'Cleaning', other: 'Other work', off: 'Off / PTO',
  },
  es: {
    mixing: 'Mezcla', ingredient_prep: 'Preparación de ingredientes', receiving: 'Recibir entrega', shipment_loading: 'Cargar recolección', packaging: 'Empaque', pre_op: 'Preoperación', post_op: 'Postoperación', cleaning: 'Limpieza', other: 'Otro trabajo', off: 'Libre / PTO',
  },
};
const spanishTheme = createTheme({}, esES);
const englishTheme = createTheme();
const dialogFocusable = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

function addDays(date: string, days: number): string {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  const value = new Date(Date.UTC(year, month - 1, day + days));
  return value.toISOString().slice(0, 10);
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
function conflictsFor(candidate: AssignmentInput, assignments: Assignment[], excludedId?: string) {
  return assignments.filter((item) => item.id !== excludedId
    && item.startDate <= candidate.endDate && item.endDate >= candidate.startDate
    && item.employeeIds.some((id) => candidate.employeeIds.includes(id)));
}

export default function WorkforceScheduler({
  locale, facilities, employees, assignments, publishedAssignments, publicationRevision, pto,
  productionBands, linkedTasks, products, customers, canManage, canManageSettings,
  initialPeriodStart = '', initialPeriodEnd = '',
}: Props) {
  const router = useRouter();
  const es = locale === 'es';
  const [facilityId, setFacilityId] = useState(facilities[0]?.id ?? '');
  // Plant planning is performed across the workweek; day view is a drill-in.
  const [view, setView] = useState<'day' | 'week'>('week');
  const [visibleDate, setVisibleDate] = useState(new Date());
  const [periodStart, setPeriodStart] = useState(initialPeriodStart);
  const [periodEnd, setPeriodEnd] = useState(initialPeriodEnd);
  const [weeklyHours, setWeeklyHours] = useState(String(facilities[0]?.weeklyHours ?? 40));
  const [selectedEmployees, setSelectedEmployees] = useState<string[]>([]);
  const [employeeSearch, setEmployeeSearch] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<WorkType[]>([]);
  const [sortPeople, setSortPeople] = useState<'least' | 'most' | 'name'>('least');
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formOpen, setFormOpen] = useState(false);
  const [form, setForm] = useState<AssignmentInput>({
    facilityId,
    startDate: dateKey(new Date()),
    endDate: dateKey(new Date()),
    type: 'mixing',
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
    startDate: dateKey(new Date()),
    endDate: dateKey(new Date()),
    startMinute: 0,
    endMinute: 1440,
    privateNote: '',
    revision: 0,
  });
  const [pending, startTransition] = useTransition();
  const dialogRef = useRef<HTMLElement>(null);
  const dialogOpenerRef = useRef<HTMLElement | null>(null);
  const pendingRef = useRef(pending);
  let activeDialog: 'pto' | 'assignment' | null = null;
  if (ptoOpen) activeDialog = 'pto';
  else if (formOpen) activeDialog = 'assignment';

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
      } else if (event.shiftKey && (document.activeElement === first
        || !dialog.contains(document.activeElement))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last
        || !dialog.contains(document.activeElement))) {
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
      ? document.activeElement : null;
  }
  const facility = facilities.find((item) => item.id === facilityId);
  const facilityEmployees = useMemo(() => employees.filter((item) => (
    item.facilityId === facilityId
  )), [employees, facilityId]);
  const facilityAssignments = useMemo(() => assignments.filter((item) => (
    item.facilityId === facilityId
  )), [assignments, facilityId]);
  const displayedEmployees = useMemo(() => (selectedEmployees.length
    ? facilityEmployees.filter((item) => selectedEmployees.includes(item.id))
    : facilityEmployees), [facilityEmployees, selectedEmployees]);
  const shownIds = useMemo(() => new Set(displayedEmployees.map((item) => item.id)), [
    displayedEmployees,
  ]);
  const activeDate = dateKey(visibleDate);
  const weekStart = addDays(activeDate, -((visibleDate.getDay() + 6) % 7));
  const defaultStart = view === 'day' ? activeDate : weekStart;
  const defaultEndExclusive = addDays(defaultStart, view === 'day' ? 1 : 7);
  const reportStart = periodStart || defaultStart;
  const reportEndExclusive = periodEnd ? addDays(periodEnd, 1) : defaultEndExclusive;
  const reportValid = reportEndExclusive > reportStart;
  const capacityDays = reportValid ? countWeekdays(reportStart, reportEndExclusive) : 0;
  const capacityHours = (capacityDays * (facility?.weeklyHours ?? 40)) / 5;
  const utilization = useMemo(() => new Map(facilityEmployees.map((person) => {
    const scheduledDates = new Set<string>();
    facilityAssignments.filter((item) => item.employeeIds.includes(person.id) && item.type !== 'off')
      .forEach((item) => assignmentDates(item, reportStart, reportEndExclusive)
        .forEach((date) => scheduledDates.add(date)));
    const hours = (scheduledDates.size * (facility?.weeklyHours ?? 40)) / 5;
    return [person.id, { hours, percent: capacityHours ? Math.round((hours / capacityHours) * 100) : 0 }];
  })), [facilityEmployees, facilityAssignments, reportStart, reportEndExclusive, facility, capacityHours]);
  const peopleForPanel = useMemo(() => facilityEmployees
    .filter((person) => person.name.toLocaleLowerCase().includes(employeeSearch.trim().toLocaleLowerCase()))
    .toSorted((left, right) => {
      if (sortPeople === 'name') return left.name.localeCompare(right.name);
      const difference = (utilization.get(left.id)?.percent ?? 0) - (utilization.get(right.id)?.percent ?? 0);
      return sortPeople === 'least' ? difference || left.name.localeCompare(right.name) : -difference || left.name.localeCompare(right.name);
    }), [facilityEmployees, employeeSearch, sortPeople, utilization]);

  function assignmentContext(item: Assignment): string {
    const product = item.productId
      ? products.find((candidate) => candidate.id === item.productId)?.name : null;
    const customer = item.customerId
      ? customers.find((candidate) => candidate.id === item.customerId)?.name : null;
    return [item.note, product, customer, item.locationLabel].filter(Boolean).join(' · ');
  }

  const calendarEvents = useMemo<SchedulerEvent[]>(() => [...facilityAssignments
    .filter((item) => (!item.employeeIds.length || item.employeeIds.some((id) => shownIds.has(id)))
      && (!selectedTypes.length || selectedTypes.includes(item.type)))
    .map((item) => ({
      id: item.id,
      title: [labels[locale][item.type], assignmentContext(item)].filter(Boolean).join(' · '),
      start: item.startDate,
      end: addDays(item.endDate, 1),
      allDay: true,
      color: colors[item.type],
      resource: item.employeeIds.length ? item.employeeIds : ['unassigned'],
    })), ...productionBands.map((band) => ({
    id: `production-${band.id}`,
    title: band.label,
    start: band.startDate,
    end: addDays(band.endDate, 1),
    allDay: true,
    resource: 'production-context',
    color: productionColor,
    readOnly: true,
  }))], [facilityAssignments, shownIds, selectedTypes, locale, facilityEmployees, productionBands]);
  const resources = [
    { id: 'production-context', title: es ? 'Producción planificada' : 'Planned production', areEventsReadOnly: true },
    { id: 'unassigned', title: es ? 'Sin asignar' : 'Unassigned' },
    ...displayedEmployees.map((item) => ({ id: item.id, title: item.name })),
  ];
  const overlappingIds = new Set(facilityAssignments.filter((item) => conflictsFor({
    facilityId: item.facilityId,
    startDate: item.startDate,
    endDate: item.endDate,
    type: item.type,
    employeeIds: item.employeeIds,
    note: item.note,
    productionPlanId: item.productionPlanId,
    linkedTaskType: item.linkedTaskType,
    linkedTaskId: item.linkedTaskId,
    productId: item.productId,
    customerId: item.customerId,
    locationLabel: item.locationLabel,
    availabilityOverrideReason: item.availabilityOverrideReason,
  }, facilityAssignments, item.id).length > 0).map((item) => item.id));
  const relevantBands = productionBands.filter((band) => (
    band.startDate < reportEndExclusive && band.endDate >= reportStart
  ));
  const workweekDays = useMemo(() => Array.from({ length: 5 }, (_, index) => {
    const date = addDays(weekStart, index);
    const work = facilityAssignments.filter((item) => item.startDate <= date && item.endDate >= date
      && item.type !== 'off');
    const assignedWorkers = new Set(work.flatMap((item) => item.employeeIds));
    const unstaffed = work.filter((item) => item.employeeIds.length === 0);
    const weekday = localDate(date).toLocaleDateString(es ? 'es-US' : 'en-US', {
      weekday: 'short', month: 'short', day: 'numeric',
    });
    return {
      date,
      weekday,
      work,
      unstaffed,
      assignedWorkers: assignedWorkers.size,
      dailyCapacity: (facility?.weeklyHours ?? 40) / 5,
      mixing: work.filter((item) => item.type === 'mixing').length,
    };
  }), [weekStart, facilityAssignments, facility, es]);

  const persist = useCallback(async (input: AssignmentInput, id?: string) => {
    const previous = id ? assignments.find((item) => item.id === id) : undefined;
    const result = await saveScheduleEvent({
      id: id ?? crypto.randomUUID(),
      facility_id: input.facilityId,
      revision: previous?.revision ?? 0,
      start_on: input.startDate,
      end_on: addDays(input.endDate, 1),
      kind: input.type,
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
    if (result.ok) router.refresh();
    return result;
  }, [assignments, router]);

  function selectFacility(id: string) {
    setFacilityId(id);
    setSelectedEmployees([]);
    setForm((current) => ({ ...current, facilityId: id, employeeIds: [] }));
    setFormOpen(false);
    setMessage('');
  }
  function openForm(assignment?: Assignment) {
    rememberDialogOpener();
    setEditingId(assignment?.id ?? null);
    setForm(assignment ? {
      facilityId: assignment.facilityId,
      startDate: assignment.startDate,
      endDate: assignment.endDate,
      type: assignment.type,
      employeeIds: assignment.employeeIds,
      note: assignment.note,
      productionPlanId: assignment.productionPlanId,
      linkedTaskType: assignment.linkedTaskType,
      linkedTaskId: assignment.linkedTaskId,
      productId: assignment.productId,
      customerId: assignment.customerId,
      locationLabel: assignment.locationLabel,
      availabilityOverrideReason: assignment.availabilityOverrideReason,
    } : {
      facilityId,
      startDate: activeDate,
      endDate: activeDate,
      type: 'mixing',
      employeeIds: selectedEmployees,
      note: null,
      productionPlanId: null,
      linkedTaskType: null,
      linkedTaskId: null,
      productId: null,
      customerId: null,
      locationLabel: null,
      availabilityOverrideReason: null,
    });
    setFormOpen(true);
    setMessage('');
  }
  function saveForm() {
    if (!form.facilityId || !form.startDate
      || !form.endDate || form.endDate < form.startDate) {
      setMessage(es ? 'Seleccione un intervalo de fechas válido.' : 'Choose a valid date range.');
      return;
    }
    startTransition(async () => {
      const result = await persist(form, editingId ?? undefined);
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      setFormOpen(false);
      setMessage(es ? 'Asignación guardada.' : 'Assignment saved.');
    });
  }
  const deleteAssignment = useCallback((id: string) => {
    startTransition(async () => {
      const previous = assignments.find((item) => item.id === id);
      if (!previous) return;
      const result = await deleteScheduleEvent({
        id, facility_id: facilityId, revision: previous.revision,
      });
      if (!result.ok) {
        setMessage(result.message);
        return;
      }
      router.refresh();
      setFormOpen(false);
      setMessage(es ? 'Asignación eliminada.' : 'Assignment deleted.');
    });
  }, [assignments, facilityId, es, router]);
  const handleCalendarChange = useCallback((next: SchedulerEvent[]) => {
    if (!canManage || pending) return;
    const currentIds = new Set(calendarEvents.map((event) => String(event.id)));
    const nextIds = new Set(next.map((event) => String(event.id)));
    const deleted = calendarEvents.find((event) => (
      !String(event.id).startsWith('production-') && !nextIds.has(String(event.id))
    ));
    if (deleted) {
      deleteAssignment(String(deleted.id));
      return;
    }
    const updated = next.find((event) => {
      const previous = calendarEvents.find((item) => String(item.id) === String(event.id));
      return previous && (dateKey(event.start) !== dateKey(previous.start)
        || dateKey(event.end) !== dateKey(previous.end)
        || JSON.stringify(event.resource) !== JSON.stringify(previous.resource));
    });
    if (!updated) {
      const created = next.find((event) => !currentIds.has(String(event.id)));
      if (created) {
        const resourcesForEvent = Array.isArray(created.resource)
          ? created.resource : [created.resource];
        const selectedIds = resourcesForEvent
          .filter((id): id is string => typeof id === 'string'
            && facilityEmployees.some((person) => person.id === id));
        setEditingId(null);
        setForm({
          facilityId,
          startDate: dateKey(created.start),
          endDate: addDays(dateKey(created.end), -1),
          type: 'mixing',
          employeeIds: selectedIds,
          note: null,
          productionPlanId: null,
          linkedTaskType: null,
          linkedTaskId: null,
          productId: null,
          customerId: null,
          locationLabel: null,
          availabilityOverrideReason: null,
        });
        rememberDialogOpener();
        setFormOpen(true);
      }
      return;
    }
    const assignment = facilityAssignments.find((item) => item.id === String(updated.id));
    if (!assignment) return;
    if (!updated.allDay) {
      setMessage(es ? 'Esta instalación usa asignaciones de día completo.' : 'This facility uses all-day assignments.');
      return;
    }
    const employeeIds = (Array.isArray(updated.resource) ? updated.resource : [updated.resource])
      .filter((id): id is string => typeof id === 'string' && facilityEmployees.some((person) => person.id === id));
    const nextInput: AssignmentInput = {
      facilityId,
      startDate: dateKey(updated.start),
      endDate: addDays(dateKey(updated.end), -1),
      type: assignment.type,
      employeeIds: employeeIds.length ? employeeIds : assignment.employeeIds,
      note: assignment.note,
      productionPlanId: assignment.productionPlanId,
      linkedTaskType: assignment.linkedTaskType,
      linkedTaskId: assignment.linkedTaskId,
      productId: assignment.productId,
      customerId: assignment.customerId,
      locationLabel: assignment.locationLabel,
      availabilityOverrideReason: assignment.availabilityOverrideReason,
    };
    if (nextInput.endDate < nextInput.startDate) return;
    startTransition(async () => {
      const result = await persist(nextInput, assignment.id);
      const success = es ? 'Asignación movida.' : 'Assignment moved.';
      setMessage(result.ok ? success : result.message);
    });
  }, [canManage, pending, calendarEvents, facilityAssignments, facilityEmployees,
    facilityId, es, deleteAssignment, persist]);
  function applyPeriod() {
    if (!periodStart || !periodEnd || periodEnd < periodStart) {
      setMessage(es ? 'Seleccione un período válido.' : 'Choose a valid reporting period.');
      return;
    }
    router.replace(`/app/scheduling?start=${periodStart}&end=${periodEnd}`);
  }
  function saveCapacity() {
    const hours = Number(weeklyHours);
    if (!facility || !Number.isFinite(hours) || hours < 1 || hours > 168 || (hours * 4) % 1 !== 0) {
      setMessage(es ? 'Ingrese entre 1 y 168 horas en incrementos de 15 minutos.' : 'Enter 1–168 hours in quarter-hour increments.');
      return;
    }
    startTransition(async () => {
      const result = await saveFacilitySchedulingSettings({
        facility_id: facility.id, weekly_capacity_hours: hours,
      });
      const success = es ? 'Capacidad guardada.' : 'Capacity saved.';
      setMessage(result.ok ? success : result.message);
      if (result.ok) router.refresh();
    });
  }
  const changeView = useCallback((nextView: 'day' | 'week' | 'month' | 'agenda') => {
    if (nextView === 'day' || nextView === 'week') setView(nextView);
  }, []);
  function resetPeriod() {
    setPeriodStart('');
    setPeriodEnd('');
    router.replace('/app/scheduling');
  }
  function publishDraft() {
    startTransition(async () => {
      const result = await publishSchedule({
        facility_id: facilityId, revision: publicationRevision,
      });
      if (result.ok) setMessage(es ? 'Horario publicado para el equipo.' : 'Schedule published for workers.');
      else setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  function savePto() {
    if (!ptoForm.employeeId || ptoForm.endDate < ptoForm.startDate) {
      setMessage(es ? 'Seleccione empleado y fechas válidas.' : 'Choose an employee and valid dates.');
      return;
    }
    startTransition(async () => {
      const result = await saveSchedulePto({
        id: ptoForm.id || crypto.randomUUID(),
        facility_id: facilityId,
        employee_id: ptoForm.employeeId,
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
        id: block.id, facility_id: facilityId, revision: block.revision,
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
        facility_id: facilityId, employee_id: employee.id, available_days: availableDays,
      });
      if (result.ok) setMessage(es ? 'Disponibilidad guardada.' : 'Availability saved.');
      else setMessage(result.message);
      if (result.ok) router.refresh();
    });
  }
  let publicationStatus = es ? 'Todavía no hay horario publicado.' : 'No schedule has been published yet.';
  if (publicationRevision) publicationStatus = `${es ? 'Versión publicada' : 'Published revision'} ${publicationRevision}`;
  function assignmentPublicationLabel(item: Assignment): string {
    const published = publishedAssignments.some((previous) => matchesPublishedWork(item, previous));
    if (published) return es ? 'Publicado' : 'Published';
    return es ? 'Borrador' : 'Draft';
  }
  let dialogTitle = es ? 'Agregar trabajo' : 'Add work';
  if (editingId) dialogTitle = es ? 'Editar trabajo' : 'Edit work';

  return (
    <div className={styles.workspace}>
      <div className={styles.controlBar}>
      <div className={styles.filters} aria-label={es ? 'Filtros de horario' : 'Schedule filters'}>
        <div className={styles.controlIntro}>
          <strong>{es ? 'Semana de trabajo' : 'Plant workweek'}</strong>
          <span>{es ? 'Planifique el trabajo diario, las entregas y las recolecciones de la semana.' : 'Plan daily work, deliveries, and pickups across the week.'}</span>
        </div>
        <label>
          {es ? 'Instalación' : 'Facility'}
          <select value={facilityId} onChange={(event) => selectFacility(event.target.value)}>
            {facilities.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}
          </select>
        </label>
        <div className={styles.viewSwitch} role="group" aria-label={es ? 'Vista del calendario' : 'Calendar view'}>
          <button type="button" aria-pressed={view === 'day'} onClick={() => setView('day')}>{es ? 'Día' : 'Day'}</button>
          <button type="button" aria-pressed={view === 'week'} onClick={() => setView('week')}>{es ? 'Semana laboral' : 'Workweek'}</button>
        </div>
        <label>
          {es ? 'Tipos de trabajo' : 'Work types'}
          <select multiple value={selectedTypes} onChange={(event) => setSelectedTypes([...event.currentTarget.selectedOptions].map((option) => option.value as WorkType))}>
            {types.map((type) => <option key={type} value={type}>{labels[locale][type]}</option>)}
          </select>
        </label>
      </div>
      {canManage && <div className={styles.actions} aria-label={es ? 'Acciones de horario' : 'Schedule actions'}>
        <div className={styles.controlIntro}>
          <strong>{es ? 'Plan semanal' : 'Weekly plan'}</strong>
          <span>{es ? 'Agregue trabajo diario y publique la semana.' : 'Add daily work and publish the week.'}</span>
        </div>
        <button type="button" className={styles.primary} onClick={() => openForm()}>{es ? 'Agregar trabajo' : 'Add work'}</button>
        <button
          type="button"
          disabled={pending}
          onClick={() => {
            rememberDialogOpener();
            setPtoForm({
              id: '',
              employeeId: facilityEmployees[0]?.id ?? '',
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
      </div>}
      </div>
      <p className={styles.publication}>
        {publicationStatus}
        {' · '}
        {es ? 'Los cambios de borrador aparecen a los trabajadores al publicar.'
          : 'Draft changes reach workers when you publish.'}
      </p>
      {!facilities.length && <p>{es ? 'No hay instalaciones disponibles.' : 'No facilities are available.'}</p>}
      {facilities.length > 0 && (
      <>
        {canManageSettings && (
        <section className={styles.capacity} aria-label={es ? 'Capacidad semanal de la instalación' : 'Facility weekly capacity'}>
          <label>
            {es ? 'Capacidad semanal por empleado (horas)' : 'Weekly capacity per employee (hours)'}
            <input type="number" min="1" max="168" step="0.25" value={weeklyHours} onChange={(event) => setWeeklyHours(event.target.value)} />
          </label>
          <button type="button" disabled={pending} onClick={saveCapacity}>{es ? 'Guardar capacidad' : 'Save capacity'}</button>
        </section>
        )}
        <section className={styles.workweek} aria-labelledby="workweek-heading">
          <div className={styles.workweekHeading}>
            <div>
              <h2 id="workweek-heading">{es ? 'Resumen de la semana laboral' : 'Workweek at a glance'}</h2>
              <p>{es
                ? 'Cada día muestra el trabajo publicado o en borrador, la cobertura de personal y las brechas que requieren atención.'
                : 'Each day shows draft or published work, crew coverage, and gaps that need attention.'}</p>
            </div>
            <span>{es ? 'Capacidad por persona' : 'Per-person capacity'} · {((facility?.weeklyHours ?? 40) / 5).toFixed(1)}h/{es ? 'día' : 'day'}</span>
          </div>
          <div className={styles.dayCards}>
            {workweekDays.map((day) => (
              <article key={day.date} className={styles.dayCard}>
                <div className={styles.dayCardTitle}>
                  <strong>{day.weekday}</strong>
                  <span>{day.work.length} {es ? 'tareas' : 'tasks'}</span>
                </div>
                <dl>
                  <div><dt>{es ? 'Personal asignado' : 'Crew assigned'}</dt><dd>{day.assignedWorkers}</dd></div>
                  <div><dt>{es ? 'Mezcla' : 'Mixing'}</dt><dd>{day.mixing}</dd></div>
                  <div><dt>{es ? 'Capacidad' : 'Capacity'}</dt><dd>{day.dailyCapacity.toFixed(1)}h</dd></div>
                </dl>
                {day.unstaffed.length > 0 ? (
                  <p className={styles.gap}>{day.unstaffed.length} {es ? 'tarea(s) sin personal' : 'unstaffed task(s)'}</p>
                ) : (
                  <p className={styles.covered}>{day.work.length ? (es ? 'Cobertura asignada' : 'Crew coverage assigned') : (es ? 'No hay trabajo programado' : 'No work scheduled')}</p>
                )}
              </article>
            ))}
          </div>
        </section>
        <SchedulerWorkQueue
          key={`${facilityId}-${activeDate}`}
          facilityId={facilityId}
          initialDate={activeDate}
          locale={locale}
          canManage={canManage}
          linkedTasks={linkedTasks}
        />
        <div className={styles.layout}>
          <aside className={styles.sidebar} aria-label={es ? 'Personal y producción' : 'Staffing and production'}>
            <h2>{es ? 'Personal' : 'Staffing'}</h2>
            <p>{es ? 'Seleccione una o más personas para enfocar el calendario y rellenar una nueva asignación.' : 'Select one or more people to focus the calendar and prefill a new assignment.'}</p>
            <p>{es ? 'La menor utilización aparece primero para ayudar a equilibrar el trabajo.' : 'Least utilized appears first to help balance work.'}</p>
            <div className={styles.peopleControls}>
              <input aria-label={es ? 'Buscar empleados' : 'Search employees'} placeholder={es ? 'Buscar' : 'Search'} value={employeeSearch} onChange={(event) => setEmployeeSearch(event.target.value)} />
              <select aria-label={es ? 'Ordenar empleados' : 'Sort employees'} value={sortPeople} onChange={(event) => setSortPeople(event.target.value as typeof sortPeople)}>
                <option value="least">{es ? 'Menor utilización' : 'Least utilized'}</option>
                <option value="most">{es ? 'Mayor utilización' : 'Most utilized'}</option>
                <option value="name">{es ? 'Nombre' : 'Name'}</option>
              </select>
              <button type="button" onClick={() => setSelectedEmployees([])}>{es ? 'Ver todos' : 'Show all'}</button>
            </div>
            <div className={styles.employeeList}>
              {peopleForPanel.map((person) => (
                <button
                  key={person.id}
                  type="button"
                  className={styles.personOption}
                  aria-pressed={selectedEmployees.includes(person.id)}
                  onClick={() => setSelectedEmployees((current) => (current.includes(person.id)
                    ? current.filter((id) => id !== person.id) : [...current, person.id]))}
                >
                  <span className={styles.personName}>{person.name}</span>
                  <span className={styles.utilization}>{utilization.get(person.id)?.hours.toFixed(1)}h · {utilization.get(person.id)?.percent}%</span>
                </button>
              ))}
              {!facilityEmployees.length && <p>{es ? 'No hay empleados en esta instalación.' : 'No employees at this facility.'}</p>}
            </div>
            <h2>{es ? 'Producción planificada' : 'Production plan'}</h2>
            <p>{es ? 'Estas fechas son una referencia; se permiten tareas fuera de ellas.' : 'These dates are a guide; work can be scheduled outside them.'}</p>
            <ul className={styles.bands}>
              {relevantBands.map((band) => (
                <li key={band.id}>
                  <strong>{band.label}</strong>
                  <span>
                    {band.startDate}
                    {' '}
                    –
                    {' '}
                    {band.endDate}
                  </span>
                </li>
              ))}
              {!relevantBands.length && <li>{es ? 'No hay fechas de producción en este período.' : 'No production dates in this period.'}</li>}
            </ul>
          </aside>
          <div className={styles.calendar} aria-label={es ? 'Calendario de empleados' : 'Employee calendar'}>
            <p className={styles.calendarHint}>{es ? 'Seleccione personal y luego haga clic en un día libre para programar. También puede usar Nueva asignación.' : 'Select staff, then click an open day to schedule work. You can also use New assignment.'}</p>
            <ThemeProvider theme={es ? spanishTheme : englishTheme}>
              <EventCalendar
                events={calendarEvents}
                onEventsChange={handleCalendarChange}
                resources={resources}
                shouldEventRequireResource
                view={view}
                onViewChange={changeView}
                views={['day', 'week']}
                visibleDate={visibleDate}
                onVisibleDateChange={setVisibleDate}
                dateLocale={es ? esLocale : enUS}
                readOnly={!canManage || pending}
                areEventsResizable={false}
                eventCreation={canManage}
              />
            </ThemeProvider>
          </div>
        </div>
        <section className={styles.summary} aria-labelledby="scheduler-summary-heading">
          <div className={styles.summaryHeader}>
            <div>
              <h2 id="scheduler-summary-heading">{es ? 'Utilización' : 'Utilization'}</h2>
              <p>{es ? 'Días por empleado; un día equivale a la capacidad semanal dividida entre cinco.' : 'Days per employee; one day equals weekly capacity divided by five.'}</p>
            </div>
            <div className={styles.periodFields}>
              <label>
                {es ? 'Desde' : 'From'}
                <input type="date" value={periodStart} onChange={(event) => setPeriodStart(event.target.value)} />
              </label>
              <label>
                {es ? 'Hasta' : 'Through'}
                <input type="date" value={periodEnd} onChange={(event) => setPeriodEnd(event.target.value)} />
              </label>
              <button type="button" onClick={applyPeriod}>{es ? 'Aplicar período' : 'Apply period'}</button>
              <button
                type="button"
                onClick={resetPeriod}
              >
                {es ? 'Vista actual' : 'Current view'}
              </button>
            </div>
          </div>
          {!reportValid && <p role="alert">{es ? 'La fecha final debe ser posterior a la inicial.' : 'The end date must follow the start date.'}</p>}
          {reportValid && (
          <div className={styles.tableScroll}>
            <table>
              <caption>
                {reportStart}
                {' '}
                –
                {' '}
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
                  {types.map((type) => <th key={type} scope="col">{labels[locale][type]}</th>)}
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
                  facilityAssignments.filter((item) => item.employeeIds.includes(person.id))
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
                      {types.map((type) => <td key={type}>{datesByType[type].size}</td>)}
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
            {facilityAssignments.filter((item) => (
              (!item.employeeIds.length || item.employeeIds.some((id) => shownIds.has(id)))
              && item.startDate < reportEndExclusive && item.endDate >= reportStart
            )).map((item) => (
              <li key={item.id}>
                <span>
                  <strong>{labels[locale][item.type]}</strong>
                  {' '}
                  ·
                  {' '}
                  {item.startDate}
                  {item.endDate !== item.startDate ? ` – ${item.endDate}` : ''}
                  {' '}
                  ·
                  {item.employeeIds.map((id) => facilityEmployees.find((person) => person.id === id)?.name).filter(Boolean).join(', ')}
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
                {canManage && <button type="button" onClick={() => openForm(item)}>{es ? 'Editar' : 'Edit'}</button>}
              </li>
            ))}
          </ul>
        </section>
        <section className={styles.assignments} aria-labelledby="published-heading">
          <h2 id="published-heading">{es ? 'Horario visible para trabajadores' : 'Worker-visible schedule'}</h2>
          <ul>
            {publishedAssignments.filter((item) => item.startDate < reportEndExclusive
              && item.endDate >= reportStart).map((item) => (
                <li key={item.id}>
                  <strong>{item.note || labels[locale][item.type]}</strong>
                  <span>
                    {item.startDate}
                    {' '}
                    –
                    {' '}
                    {item.endDate}
                  </span>
                  <span>
                    {item.employeeIds.map((id) => (
                      facilityEmployees.find((person) => person.id === id)?.name
                    ))
                      .filter(Boolean).join(', ') || (es ? 'Sin asignar' : 'Unassigned')}
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
          <h2 id="pto-heading">{es ? 'Ausencias y disponibilidad' : 'Time off and availability'}</h2>
          <ul>
            {pto.map((block) => (
              <li key={block.id}>
                <span>
                  {facilityEmployees.find((person) => person.id === block.employeeId)?.name}
                  {' · '}
                  {block.startDate}
                  {' '}
                  –
                  {' '}
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
          {canManage && facilityEmployees.map((person) => (
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
      {message && <p role="status" className={styles.status}>{message}</p>}
      {ptoOpen && canManage && (
        <div className={styles.modalBackdrop}>
          <section ref={dialogRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pto-dialog-title" aria-describedby="pto-dialog-description" tabIndex={-1}>
            <h2 id="pto-dialog-title">{es ? 'Ausencia del empleado' : 'Employee time off'}</h2>
            <label>
              {es ? 'Empleado' : 'Employee'}
              <select
                value={ptoForm.employeeId}
                onChange={(event) => setPtoForm({ ...ptoForm, employeeId: event.target.value })}
              >
                {facilityEmployees.map((person) => (
                  <option key={person.id} value={person.id}>{person.name}</option>
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
                  value={ptoForm.endMinute === 1440 ? '23:59'
                    : `${String(Math.floor(ptoForm.endMinute / 60)).padStart(2, '0')}:${String(ptoForm.endMinute % 60).padStart(2, '0')}`}
                  onChange={(event) => {
                    const [hour = 0, minute = 0] = event.target.value.split(':').map(Number);
                    setPtoForm({ ...ptoForm, endMinute: hour * 60 + minute });
                  }}
                />
              </label>
            </div>
            <p id="pto-dialog-description">{es ? 'Para días completos, deje las horas sin cambios.' : 'For full days, leave the times unchanged.'}</p>
            <label>
              {es ? 'Nota privada' : 'Private note'}
              <textarea
                value={ptoForm.privateNote}
                onChange={(event) => setPtoForm({ ...ptoForm, privateNote: event.target.value })}
              />
            </label>
            <div className={styles.dialogActions}>
              <button type="button" disabled={pending} onClick={() => setPtoOpen(false)}>{es ? 'Cerrar' : 'Close'}</button>
              <button type="button" className={styles.primary} disabled={pending} onClick={savePto}>
                {es ? 'Guardar ausencia' : 'Save time off'}
              </button>
            </div>
          </section>
        </div>
      )}
      {formOpen && canManage && (
      <div className={styles.modalBackdrop}>
        <section ref={dialogRef} className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="assignment-dialog-title" aria-describedby="assignment-dialog-description" tabIndex={-1}>
          <h2 id="assignment-dialog-title">
            {dialogTitle}
          </h2>
          <p id="assignment-dialog-description">
            {es ? 'Seleccione la tarea, las fechas y los empleados para esta asignación.' : 'Choose the task, dates, and employees for this assignment.'}
          </p>
          <label>
            {es ? 'Tarea' : 'Task'}
            <select
              value={form.type}
              onChange={(event) => {
                const type = types.find((item) => item === event.target.value);
                if (type) setForm({ ...form, type });
              }}
            >
              {types.map((type) => <option key={type} value={type}>{labels[locale][type]}</option>)}
            </select>
          </label>
          <div className={styles.dates}>
            <label>
              {es ? 'Desde' : 'From'}
              <input type="date" value={form.startDate} onChange={(event) => setForm({ ...form, startDate: event.target.value })} />
            </label>
            <label>
              {es ? 'Hasta' : 'Through'}
              <input type="date" value={form.endDate} onChange={(event) => setForm({ ...form, endDate: event.target.value })} />
            </label>
          </div>
          <fieldset>
            <legend>{es ? 'Empleados' : 'Employees'}</legend>
            <div className={styles.employeeList}>
              {facilityEmployees.map((person) => (
                <label key={person.id}>
                  <input type="checkbox" checked={form.employeeIds.includes(person.id)} onChange={(event) => setForm({ ...form, employeeIds: event.target.checked ? [...form.employeeIds, person.id] : form.employeeIds.filter((id) => id !== person.id) })} />
                  {person.name}
                </label>
              ))}
            </div>
          </fieldset>
          <label>
            {es ? 'Nota' : 'Note'}
            <textarea value={form.note ?? ''} onChange={(event) => setForm({ ...form, note: event.target.value || null })} rows={3} />
          </label>
          <label>
            {es ? 'Motivo para programar fuera de disponibilidad' : 'Reason for scheduling outside availability'}
            <textarea
              value={form.availabilityOverrideReason ?? ''}
              onChange={(event) => setForm({
                ...form,
                availabilityOverrideReason: event.target.value || null,
              })}
              rows={2}
            />
          </label>
          <label>
            {es ? 'Tarea de producción vinculada' : 'Linked production task'}
            <select
              value={form.linkedTaskType && form.linkedTaskId
                ? `${form.linkedTaskType}:${form.linkedTaskId}` : ''}
              onChange={(event) => {
                const selected = linkedTasks.find((task) => `${task.type}:${task.id}` === event.target.value);
                setForm({
                  ...form,
                  productionPlanId: selected?.productionPlanId ?? null,
                  linkedTaskType: selected?.type ?? null,
                  linkedTaskId: selected?.id ?? null,
                });
              }}
            >
              <option value="">{es ? 'Sin tarea vinculada' : 'No linked task'}</option>
              {linkedTasks.map((task) => (
                <option key={`${task.type}:${task.id}`} value={`${task.type}:${task.id}`}>
                  {task.label}
                </option>
              ))}
            </select>
          </label>
          <label>
            {es ? 'Producto' : 'Product'}
            <select
              value={form.productId ?? ''}
              onChange={(event) => setForm({ ...form, productId: event.target.value || null })}
            >
              <option value="">{es ? 'Sin producto' : 'No product'}</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            {es ? 'Cliente' : 'Customer'}
            <select
              value={form.customerId ?? ''}
              onChange={(event) => setForm({ ...form, customerId: event.target.value || null })}
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
            {es ? 'Lugar' : 'Location'}
            <input
              value={form.locationLabel ?? ''}
              maxLength={120}
              onChange={(event) => setForm({
                ...form,
                locationLabel: event.target.value || null,
              })}
            />
          </label>
          {conflictsFor(form, facilityAssignments, editingId ?? undefined).length > 0 && (
          <p className={styles.warning} role="status">
            ⚠
            {es ? 'Hay un conflicto de asignación. Cambie el empleado o las fechas antes de guardar.' : 'Assignment conflict. Change the employee or dates before saving.'}
          </p>
          )}
          <div className={styles.dialogActions}>
            {editingId && <button type="button" disabled={pending} onClick={() => deleteAssignment(editingId)}>{es ? 'Eliminar' : 'Delete'}</button>}
            <button type="button" disabled={pending} onClick={() => setFormOpen(false)}>{es ? 'Cancelar' : 'Cancel'}</button>
            <button type="button" className={styles.primary} disabled={pending} onClick={saveForm}>{es ? 'Guardar' : 'Save'}</button>
          </div>
        </section>
      </div>
      )}
    </div>
  );
}
