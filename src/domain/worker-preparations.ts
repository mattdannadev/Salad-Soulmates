import { z } from 'zod';

export const workerLineSchema = z.object({
  id: z.uuid().nullable(),
  ingredient_id: z.uuid(),
  ingredient_name: z.string(),
  required_quantity: z.number().positive(),
  uom: z.string(),
  sequence: z.number().int().positive(),
  usages: z.array(z.object({
    id: z.uuid(),
    serialized_unit_id: z.uuid(),
    source_lot: z.string(),
    quantity: z.number().positive(),
  })),
  packages: z.array(z.object({
    id: z.uuid(),
    internal_code: z.string(),
    source_lot: z.string(),
    remaining_quantity: z.number().nonnegative(),
    availability: z.string(),
  })),
});

export const workerIssueSchema = z.object({
  id: z.uuid(),
  worksheet_line_id: z.uuid().nullable(),
  serialized_unit_id: z.uuid().nullable(),
  category: z.enum(['Spice', 'Bucket']),
  note: z.string(),
  created_at: z.iso.datetime({ offset: true }),
});

export const workerPreparationsSchema = z.array(z.object({
  planned_mixer_batch_id: z.uuid(),
  planned_spice_preparation_id: z.uuid(),
  sequence: z.number().int().positive(),
  target_gallons: z.number().positive(),
  product_name: z.string(),
  production_lot_id: z.uuid(),
  production_lot_code: z.string(),
  assigned_on: z.iso.date(),
  plan_start_on: z.iso.date(),
  plan_finish_on: z.iso.date(),
  execution_id: z.uuid().nullable(),
  status: z.enum(['Not started', 'Open', 'Complete']),
  lines: z.array(workerLineSchema),
  issues: z.array(workerIssueSchema),
}));

export type WorkerPreparation = z.infer<typeof workerPreparationsSchema>[number];
export type WorkerLine = z.infer<typeof workerLineSchema>;
