import { z } from 'zod';

const date = z.iso.date();

export const workQueueKinds = [
  'pre_op', 'post_op', 'ingredient_prep', 'mixing', 'shipment_loading',
  'receiving', 'packaging', 'maintenance', 'cleaning', 'other',
] as const;

export const workQueueRangeSchema = z.object({
  start_on: date,
  end_on: date,
}).refine((value) => value.end_on > value.start_on, {
  message: 'End date must follow start date.',
});

export const workQueueClaimSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().positive(),
});

export const createWorkQueueItemSchema = z.object({
  id: z.uuid(),
  facility_id: z.uuid(),
  work_on: date,
  kind: z.enum(workQueueKinds),
  title: z.string().trim().max(120).default(''),
  instructions: z.string().trim().max(2000).default(''),
  batch_quota: z.number().int().min(1).max(100000)
    .nullable()
    .default(null),
  estimated_minutes: z.number().finite().positive().max(100000)
    .nullable()
    .default(null),
  required_worker_count: z.number().int().min(1).max(100)
    .default(1),
  work_package_id: z.uuid().nullable().default(null),
  linked_task_type: z.string().trim().min(1).max(80)
    .nullable()
    .default(null),
  linked_task_id: z.uuid().nullable().default(null),
}).refine((value) => (value.linked_task_type === null) === (value.linked_task_id === null), {
  message: 'Choose a complete linked task.',
}).refine((value) => (
  ['ingredient_prep', 'mixing'].includes(value.kind)
    ? value.batch_quota !== null && value.estimated_minutes !== null
    : value.batch_quota === null && value.estimated_minutes === null
), { message: 'Prep and mixing work require a batch quota and estimate.' }).superRefine((value, context) => {
  const allowedContexts: Partial<Record<typeof workQueueKinds[number], string[]>> = {
    receiving: ['purchase_draft', 'purchase_order', 'purchase_receipt'],
    ingredient_prep: ['planned_spice_preparation', 'production_plan'],
    mixing: ['planned_mixer_batch', 'production_plan'],
    packaging: ['production_lot', 'packaging_run'],
    maintenance: ['equipment'],
    shipment_loading: ['order', 'shipment_fulfillment'],
    pre_op: ['production_plan', 'production_lot', 'plant_operations'],
    post_op: ['production_plan', 'production_lot', 'plant_operations'],
  };
  const allowed = allowedContexts[value.kind];
  if (allowed && !(value.kind === 'maintenance' && value.linked_task_type === null)
    && !allowed.includes(value.linked_task_type ?? '')) {
    context.addIssue({ code: 'custom', message: 'Choose the operational workflow for this work.' });
  }
});

export const publishWorkQueueSchema = z.object({
  facility_id: z.uuid(),
  work_on: date,
});

export const workerQueueItemSchema = z.object({
  id: z.uuid(),
  work_on: date,
  kind: z.enum(workQueueKinds),
  title: z.string(),
  instructions: z.string(),
  batch_quota: z.number().int().positive().nullable(),
  estimated_minutes: z.number().finite().positive().nullable(),
  status: z.enum(['available', 'claimed', 'cancelled', 'completed']),
  publication_state: z.literal('published'),
  revision: z.number().int().positive(),
  required_worker_count: z.number().int().positive(),
  claimed_worker_count: z.number().int().min(0),
  claimed_by_me: z.boolean(),
  linked_task_type: z.string().nullable(),
  linked_task_id: z.uuid().nullable(),
  work_package_id: z.uuid().nullable().default(null),
});

export type WorkerQueueItem = z.infer<typeof workerQueueItemSchema>;

export const workerAssignmentSourceSchema = z.enum(['worker_claimed', 'supervisor_assigned']);

export const workerBatchContextSchema = z.object({
  type: z.enum(['production_batch', 'production_lot']),
  id: z.uuid(),
  code: z.string(),
  state: z.string(),
});

export const assignedWorkerWorkItemSchema = z.object({
  id: z.uuid(),
  work_on: date,
  kind: z.enum(workQueueKinds),
  title: z.string(),
  instructions: z.string(),
  status: z.enum(['available', 'claimed', 'completed']),
  revision: z.number().int().positive(),
  start_at: z.iso.datetime({ offset: true }).nullable(),
  end_at: z.iso.datetime({ offset: true }).nullable(),
  all_day: z.boolean(),
  timezone: z.string().min(1),
  location_label: z.string().nullable(),
  required_worker_count: z.number().int().positive(),
  batch_quota: z.number().int().positive().nullable(),
  estimated_minutes: z.number().finite().positive().nullable(),
  linked_task_type: z.string().nullable(),
  linked_task_id: z.uuid().nullable(),
  assignment: z.object({
    source: workerAssignmentSourceSchema,
    assigned_at: z.iso.datetime({ offset: true }),
  }),
  customer: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  order: z.object({
    id: z.uuid(),
    reference: z.string(),
    needed_on: date,
  }).nullable(),
  product: z.object({ id: z.uuid(), name: z.string() }).nullable(),
  batch_context: z.array(workerBatchContextSchema),
  coworkers: z.array(z.string()),
});

export const assignedWorkerWorkSchema = z.object({
  facility: z.object({
    id: z.uuid(),
    name: z.string(),
    timezone: z.string().min(1),
  }),
  start_on: date,
  end_on: date,
  items: z.array(assignedWorkerWorkItemSchema),
});

export type AssignedWorkerWork = z.infer<typeof assignedWorkerWorkSchema>;
export type AssignedWorkerWorkItem = z.infer<typeof assignedWorkerWorkItemSchema>;

export function workQueueKindLabel(kind: WorkerQueueItem['kind'], locale: 'en' | 'es') {
  const labels = {
    en: {
      pre_op: 'Pre-Op',
      post_op: 'Post-Op',
      ingredient_prep: 'Ingredient prep',
      mixing: 'Mixing',
      shipment_loading: 'Load shipment',
      receiving: 'Receive inventory',
      packaging: 'Packaging',
      maintenance: 'Maintenance',
      cleaning: 'Cleaning',
      other: 'Other work',
    },
    es: {
      pre_op: 'Preoperación',
      post_op: 'Postoperación',
      ingredient_prep: 'Preparación de ingredientes',
      mixing: 'Mezcla',
      shipment_loading: 'Cargar envío',
      receiving: 'Recibir inventario',
      packaging: 'Empaque',
      maintenance: 'Mantenimiento',
      cleaning: 'Limpieza',
      other: 'Otro trabajo',
    },
  };
  return labels[locale][kind];
}
