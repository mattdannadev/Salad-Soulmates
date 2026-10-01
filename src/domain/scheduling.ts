import { z } from 'zod';

/** Calendar dates are local to the facility; end_on is exclusive. */
const date = z.iso.date();
export const scheduleKinds = [
  'pre_op', 'post_op', 'ingredient_prep', 'mixing', 'receiving',
  'shipment_loading', 'packaging', 'cleaning', 'off', 'other',
] as const;
export const scheduleEventInputSchema = z.object({
  id: z.uuid(),
  facility_id: z.uuid(),
  revision: z.number().int().min(0),
  start_on: date,
  end_on: date,
  kind: z.enum(scheduleKinds),
  title: z.string().trim().max(120).default(''),
  production_plan_id: z.uuid().nullable().default(null),
  linked_task_type: z.enum(['production_plan', 'order', 'planned_mixer_batch',
    'planned_spice_preparation', 'production_lot']).nullable().default(null),
  linked_task_id: z.uuid().nullable().default(null),
  product_id: z.uuid().nullable().default(null),
  customer_id: z.uuid().nullable().default(null),
  location_label: z.string().trim().min(1).max(120)
    .nullable()
    .default(null),
  availability_override_reason: z.string().trim().min(1).max(300)
    .nullable()
    .default(null),
  employee_ids: z.array(z.uuid()).max(100),
}).refine((v) => v.end_on > v.start_on, { message: 'End date must follow start date.' })
  .refine((v) => new Set(v.employee_ids).size === v.employee_ids.length, { message: 'Choose each employee once.' })
  .refine(
    (v) => (v.linked_task_type === null) === (v.linked_task_id === null),
    { message: 'Choose a complete linked task.' },
  );

export const publishScheduleInputSchema = z.object({
  facility_id: z.uuid(), revision: z.number().int().min(0),
});

export const schedulePtoInputSchema = z.object({
  id: z.uuid(),
  facility_id: z.uuid(),
  employee_id: z.uuid(),
  revision: z.number().int().min(0),
  start_on: date,
  end_on: date,
  start_minute: z.number().int().min(0).max(1439),
  end_minute: z.number().int().min(1).max(1440),
  pto_type_id: z.uuid(),
  private_note: z.string().max(500).default(''),
}).refine(
  (v) => v.end_on > v.start_on && v.end_minute > v.start_minute,
  { message: 'Choose a valid PTO date and time range.' },
);

export const scheduleAvailabilityInputSchema = z.object({
  facility_id: z.uuid(),
  employee_id: z.uuid(),
  available_days: z.array(z.number().int().min(0).max(6)).max(7),
}).refine(
  (v) => new Set(v.available_days).size === v.available_days.length,
  { message: 'Choose each day once.' },
);

export const scheduleDeleteInputSchema = z.object({
  id: z.uuid(), facility_id: z.uuid(), revision: z.number().int().positive(),
});

export const scheduleSettingsInputSchema = z.object({
  facility_id: z.uuid(),
  weekly_capacity_hours: z.number().min(1).max(168).multipleOf(0.25),
});

export const scheduleRangeSchema = z.object({
  facility_id: z.uuid(), start_on: date, end_on: date,
}).refine((v) => v.end_on > v.start_on, { message: 'End date must follow start date.' });

export const scheduleEventSchema = scheduleEventInputSchema.safeExtend({
  revision: z.number().int().positive(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const scheduleEmployeeSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  first_name: z.string(),
  last_name: z.string(),
  available_days: z.array(z.number().int().min(0).max(6)),
});

export const schedulePtoSchema = schedulePtoInputSchema.safeExtend({
  revision: z.number().int().positive(),
});

export const schedulePtoTypeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  color: z.string(),
  sort_order: z.number().int(),
  active: z.boolean(),
});
export const saveSchedulePtoTypeSchema = z.object({
  id: z.uuid(),
  facility_id: z.uuid(),
  name: z.string().trim().min(1).max(80),
  color: z.string().regex(/^#[0-9A-Fa-f]{6}$/),
  sort_order: z.number().int().min(0),
});

export const publishedScheduleEventSchema = z.object({
  id: z.uuid(),
  start_on: date,
  end_on: date,
  kind: z.enum(scheduleKinds),
  title: z.string(),
  employee_ids: z.array(z.uuid()),
  production_plan_id: z.uuid().nullable(),
  linked_task_type: z.enum(['production_plan', 'order', 'planned_mixer_batch',
    'planned_spice_preparation', 'production_lot']).nullable(),
  linked_task_id: z.uuid().nullable(),
  product_id: z.uuid().nullable(),
  customer_id: z.uuid().nullable(),
  location_label: z.string().nullable(),
});

export interface PublishedWorkComparison {
  id: string;
  startDate: string;
  endDate: string;
  type: typeof scheduleKinds[number];
  note: string | null;
  employeeIds: string[];
  productionPlanId: string | null;
  linkedTaskType: string | null;
  linkedTaskId: string | null;
  productId: string | null;
  customerId: string | null;
  locationLabel: string | null;
}

type ComparableWork = PublishedWorkComparison;
export function matchesPublishedWork(draft: ComparableWork, published: ComparableWork): boolean {
  const draftEmployees = [...draft.employeeIds].sort();
  const publishedEmployees = [...published.employeeIds].sort();
  return draft.id === published.id && draft.startDate === published.startDate
    && draft.endDate === published.endDate && draft.type === published.type
    && draft.note === published.note && draft.productionPlanId === published.productionPlanId
    && draft.linkedTaskType === published.linkedTaskType
    && draft.linkedTaskId === published.linkedTaskId
    && draft.productId === published.productId
    && draft.customerId === published.customerId
    && draft.locationLabel === published.locationLabel
    && draftEmployees.length === publishedEmployees.length
    && draftEmployees.every((id, index) => id === publishedEmployees[index]);
}

export const schedulePlanSchema = z.object({
  id: z.uuid(), start_on: date, finish_on: date, status: z.string(),
});

export const scheduleLinkedTaskSchema = z.object({
  type: z.enum(['production_plan', 'order', 'purchase_draft', 'planned_mixer_batch',
    'planned_spice_preparation', 'production_lot']),
  id: z.uuid(),
  production_plan_id: z.uuid(),
  label: z.string(),
});

export const workforceScheduleSchema = z.object({
  facility: z.object({
    id: z.uuid(),
    name: z.string(),
    timezone: z.string(),
    weekly_capacity_hours: z.number(),
    schedule_granularity: z.enum(['day', 'hour']),
  }),
  employees: z.array(scheduleEmployeeSchema),
  events: z.array(scheduleEventSchema),
  published_events: z.array(publishedScheduleEventSchema),
  publication_revision: z.number().int().min(0),
  pto: z.array(schedulePtoSchema),
  pto_types: z.array(schedulePtoTypeSchema).default([]),
  production_plans: z.array(schedulePlanSchema),
  linked_tasks: z.array(scheduleLinkedTaskSchema),
  products: z.array(z.object({ id: z.uuid(), name: z.string() })),
  customers: z.array(z.object({ id: z.uuid(), name: z.string() })),
  customer_product_ids: z.record(z.string(), z.array(z.uuid())).default({}),
});

export const myWorkforceScheduleSchema = z.object({
  timezone: z.string().min(1),
  events: z.array(z.object({
    id: z.uuid(),
    start_on: date,
    end_on: date,
    kind: z.enum(scheduleKinds),
    title: z.string(),
    production_plan_id: z.uuid().nullable(),
    linked_task_type: z.enum(['production_plan', 'order', 'planned_mixer_batch',
      'planned_spice_preparation', 'production_lot']).nullable(),
    linked_task_id: z.uuid().nullable(),
    product_name: z.string().nullable(),
    customer_name: z.string().nullable(),
    location_label: z.string().nullable(),
    lot_code: z.string().nullable(),
    batch_sequence: z.number().int().nullable(),
  })),
  pto: z.array(z.object({
    start_on: date,
    end_on: date,
    start_minute: z.number().int(),
    end_minute: z.number().int(),
  })),
});

export type WorkforceSchedule = z.infer<typeof workforceScheduleSchema>;
export type ScheduleEventInput = z.input<typeof scheduleEventInputSchema>;

export function addScheduleDays(calendarDate: string, days: number): string {
  const [year = 0, month = 0, day = 0] = calendarDate.split('-').map(Number);
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export function inclusiveScheduleEnd(endOn: string): string {
  return addScheduleDays(endOn, -1);
}

export function facilityCalendarDateAt(instant: Date, timezone: string): string {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
  }).formatToParts(instant);
  const part = (name: string) => parts.find((item) => item.type === name)?.value ?? '';
  return `${part('year')}-${part('month')}-${part('day')}`;
}

export function selectLinkedPreparation<T extends {
  planned_spice_preparation_id: string; planned_mixer_batch_id: string;
}>(
  kind: 'planned_spice_preparation' | 'planned_mixer_batch',
  linkedId: string,
  preparations: T[],
): T | undefined {
  return preparations.find((preparation) => (
    kind === 'planned_spice_preparation'
      ? preparation.planned_spice_preparation_id === linkedId
      : preparation.planned_mixer_batch_id === linkedId
  ));
}

export function scheduleKindLabel(kind: typeof scheduleKinds[number], locale: 'en' | 'es') {
  const labels = {
    en: {
      pre_op: 'Pre-Op',
      post_op: 'Post-Op',
      ingredient_prep: 'Ingredient prep',
      mixing: 'Mixing',
      receiving: 'Receive delivery',
      shipment_loading: 'Load pickup',
      packaging: 'Packaging',
      cleaning: 'Cleaning',
      off: 'Time off',
      other: 'Other work',
    },
    es: {
      pre_op: 'Preoperación',
      post_op: 'Postoperación',
      ingredient_prep: 'Preparación de ingredientes',
      mixing: 'Mezcla',
      receiving: 'Recibir entrega',
      shipment_loading: 'Cargar recolección',
      packaging: 'Empaque',
      cleaning: 'Limpieza',
      off: 'Ausencia',
      other: 'Otro trabajo',
    },
  };
  return labels[locale][kind];
}

interface Dates { start_on: string; end_on: string }
interface Days<T> { day: string; events: T[] }

/** Expand exclusive-end work dates for a worker's phone day list. */
export function groupWorkDays<T extends Dates>(items: T[], from: string, to: string): Days<T>[] {
  const days = new Map<string, T[]>();
  items.forEach((event) => {
    for (let day = event.start_on < from ? from : event.start_on;
      day < event.end_on && day < to; day = addScheduleDays(day, 1)) {
      days.set(day, [...(days.get(day) ?? []), event]);
    }
  });
  return [...days].sort(([left], [right]) => left.localeCompare(right))
    .map(([day, groupedEvents]) => ({ day, events: groupedEvents }));
}
