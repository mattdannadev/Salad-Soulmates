import { z } from 'zod';

export const productionBatchStateSchema = z.enum([
  'not_started',
  'in_progress',
  'awaiting_quality',
  'released',
  'on_hold',
  'rejected',
  'cancelled',
]);

export const preparationExecutionStateSchema = z.enum([
  'not_started',
  'in_progress',
  'complete',
  'cancelled',
]);

export const finishedRecallLotStateSchema = z.enum([
  'open',
  'released',
  'on_hold',
  'closed',
  'recalled',
]);

export const preparationTraceabilityModeSchema = z.enum([
  'production_day_product',
  'batch_specific_allocation',
]);

export const productionBatchStartSchema = z.object({
  production_batch_id: z.uuid(),
  revision: z.number().int().positive(),
  mixer_equipment_id: z.uuid(),
  tank_equipment_id: z.uuid(),
});

export const productionDayEquipmentSelectionSaveSchema = z.object({
  local_production_date: z.iso.date(),
  mixer_equipment_id: z.uuid(),
  tank_equipment_id: z.uuid(),
  revision: z.number().int().nonnegative(),
});

const executionAuditSchema = z.object({
  idempotency_key: z.uuid(),
  revision: z.number().int().positive(),
  created_by: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  updated_at: z.iso.datetime({ offset: true }),
});

export const preparationExecutionSchema = executionAuditSchema.extend({
  id: z.uuid(),
  organization_id: z.uuid(),
  facility_id: z.uuid(),
  planned_spice_preparation_id: z.uuid(),
  work_order_id: z.uuid().nullable(),
  product_id: z.uuid(),
  local_production_date: z.iso.date(),
  traceability_mode_snapshot: preparationTraceabilityModeSchema,
  state: preparationExecutionStateSchema,
  started_at: z.iso.datetime({ offset: true }).nullable(),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  output_quantity: z.number().positive().nullable(),
  output_uom: z.string().trim().min(1).max(50)
    .nullable(),
});

export const productionBatchPreparationAllocationSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  facility_id: z.uuid(),
  production_batch_id: z.uuid(),
  preparation_execution_id: z.uuid(),
  quantity: z.number().positive(),
  uom: z.string().trim().min(1).max(50),
  idempotency_key: z.uuid(),
  revision: z.literal(1),
  created_by: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
});

export const finishedRecallLotSchema = executionAuditSchema.extend({
  id: z.uuid(),
  organization_id: z.uuid(),
  facility_id: z.uuid(),
  product_id: z.uuid(),
  local_production_date: z.iso.date(),
  recall_lot_code: z.string().trim().min(1).max(80),
  product_name_snapshot: z.string().trim().min(1).max(120),
  state: finishedRecallLotStateSchema,
});

export const productionBatchExecutionSchema = executionAuditSchema.extend({
  id: z.uuid(),
  organization_id: z.uuid(),
  facility_id: z.uuid(),
  planned_mixer_batch_id: z.uuid(),
  work_order_id: z.uuid().nullable(),
  product_id: z.uuid(),
  recipe_version_id: z.uuid(),
  finished_recall_lot_id: z.uuid().nullable(),
  local_production_date: z.iso.date(),
  run_sequence: z.number().int().positive(),
  run_code: z.string().trim().min(1).max(80),
  product_name_snapshot: z.string().trim().min(1).max(120),
  recipe_name_snapshot: z.string().trim().min(1).max(120),
  recipe_version_snapshot: z.number().int().positive(),
  preparation_traceability_mode_snapshot: preparationTraceabilityModeSchema,
  mixer_equipment_id: z.uuid().nullable(),
  mixer_equipment_code_snapshot: z.string().trim().min(1).max(80)
    .nullable(),
  mixer_equipment_name_snapshot: z.string().trim().min(1).max(120)
    .nullable(),
  mixer_equipment_type_snapshot: z.literal('mixer').nullable(),
  mixer_usable_capacity_snapshot: z.number().positive().nullable(),
  mixer_usable_capacity_uom_snapshot: z.string().trim().min(1).max(50)
    .nullable(),
  tank_equipment_id: z.uuid().nullable(),
  tank_equipment_code_snapshot: z.string().trim().min(1).max(80)
    .nullable(),
  tank_equipment_name_snapshot: z.string().trim().min(1).max(120)
    .nullable(),
  tank_equipment_type_snapshot: z.literal('tank').nullable(),
  tank_usable_capacity_snapshot: z.number().positive().nullable(),
  tank_usable_capacity_uom_snapshot: z.string().trim().min(1).max(50)
    .nullable(),
  expected_yield_quantity: z.number().positive().nullable(),
  expected_yield_uom: z.string().trim().min(1).max(50)
    .nullable(),
  state: productionBatchStateSchema,
  started_at: z.iso.datetime({ offset: true }).nullable(),
  completed_at: z.iso.datetime({ offset: true }).nullable(),
  preparation_traceability_mode: preparationTraceabilityModeSchema,
  preparation_allocations: z.array(productionBatchPreparationAllocationSchema),
  preparation_scope: z.array(z.object({
    trace_scope: z.enum(['candidate', 'affected']),
    preparation_execution: preparationExecutionSchema,
  })),
  finished_recall_lot: finishedRecallLotSchema.nullable(),
});

export const preparationExecutionTraceSchema = z.object({
  preparation_execution: preparationExecutionSchema,
  traceability_mode: preparationTraceabilityModeSchema,
  production_batches: z.array(productionBatchExecutionSchema.omit({
    preparation_traceability_mode: true,
    preparation_allocations: true,
    preparation_scope: true,
    finished_recall_lot: true,
  }).extend({
    trace_scope: z.enum(['candidate', 'affected']),
  })),
});

export type ProductionBatchExecution = z.infer<typeof productionBatchExecutionSchema>;
export type PreparationExecution = z.infer<typeof preparationExecutionSchema>;
export type ProductionBatchPreparationAllocation = z.infer<
  typeof productionBatchPreparationAllocationSchema
>;
export type FinishedRecallLot = z.infer<typeof finishedRecallLotSchema>;
