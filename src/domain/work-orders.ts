import { z } from 'zod';
import { createWorkQueueItemSchema, workQueueKinds } from './work-queue';

/**
 * A work order is the reusable coordination record for operational work.
 * Its current storage implementation is `workforce_work_queue_items`; keeping
 * this contract separate lets scheduling remain a projection rather than a
 * second work lifecycle.
 */
export const workOrderKinds = workQueueKinds;
export const createWorkOrderSchema = createWorkQueueItemSchema;

export const linkExecutionWorkOrderSchema = z.object({
  execution_type: z.enum(['production_batch', 'preparation_execution']),
  execution_id: z.uuid(),
  work_order_id: z.uuid(),
  revision: z.number().int().positive(),
});

export const productionBatchMixingStartSchema = z.object({
  production_batch_id: z.uuid(),
  revision: z.number().int().positive(),
  mixer_equipment_id: z.uuid(),
  tank_equipment_id: z.uuid(),
});

export const workOrderDependencySchema = z.object({
  predecessor_id: z.uuid(),
  successor_id: z.uuid(),
});

export const workOrderTaskSchema = z.object({
  id: z.uuid(),
  work_order_id: z.uuid(),
  title: z.string().trim().min(1).max(240),
  required: z.boolean().default(false),
  completed_at: z.iso.datetime({ offset: true }).nullable().default(null),
});

export const workOrderTimeEntrySchema = z.object({
  id: z.uuid(),
  work_order_id: z.uuid(),
  worker_id: z.uuid(),
  started_at: z.iso.datetime({ offset: true }),
  ended_at: z.iso.datetime({ offset: true }).nullable().default(null),
}).refine((value) => (
  value.ended_at === null || new Date(value.ended_at) > new Date(value.started_at)
), {
  message: 'A time entry must end after it starts.',
  path: ['ended_at'],
});

export const workOrderDependencyScopeSchema = z.object({
  facility_id: z.uuid(),
});

export const setWorkOrderPredecessorsSchema = z.object({
  facility_id: z.uuid(),
  successor_id: z.uuid(),
  revision: z.number().int().positive(),
  predecessor_ids: z.array(z.uuid()).max(100),
}).superRefine((value, context) => {
  if (new Set(value.predecessor_ids).size !== value.predecessor_ids.length) {
    context.addIssue({ code: 'custom', message: 'Choose each predecessor once.' });
  }
  if (value.predecessor_ids.includes(value.successor_id)) {
    context.addIssue({ code: 'custom', message: 'A work order cannot depend on itself.' });
  }
});

export const deleteWorkOrderSchema = z.object({
  facility_id: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().positive(),
});

export const moveDependentWorkSchema = z.object({
  facility_id: z.uuid(),
  id: z.uuid(),
  revision: z.number().int().positive(),
  start_at: z.iso.datetime({ offset: true }),
  end_at: z.iso.datetime({ offset: true }),
}).refine((value) => new Date(value.end_at) > new Date(value.start_at), {
  message: 'End time must follow start time.',
  path: ['end_at'],
});

export type CreateWorkOrder = z.input<typeof createWorkOrderSchema>;
export type LinkExecutionWorkOrder = z.input<typeof linkExecutionWorkOrderSchema>;
export type WorkOrderDependency = z.infer<typeof workOrderDependencySchema>;
export type WorkOrderTask = z.infer<typeof workOrderTaskSchema>;
export type WorkOrderTimeEntry = z.infer<typeof workOrderTimeEntrySchema>;
export type SetWorkOrderPredecessors = z.input<typeof setWorkOrderPredecessorsSchema>;
export type DeleteWorkOrder = z.input<typeof deleteWorkOrderSchema>;
export type MoveDependentWork = z.input<typeof moveDependentWorkSchema>;
