import { z } from 'zod';

export const productionStatusSchema = z.enum(['Draft', 'Confirmed', 'Cancelled']);
export const productionInputSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  start_on: z.iso.date(),
  finish_on: z.iso.date(),
  status: productionStatusSchema,
  note: z.string().trim().max(1000),
  shortage_reason: z.string().trim().max(1000),
}).refine((input) => input.finish_on >= input.start_on, 'Production finish must be on or after its start.')
  .refine((input) => input.status !== 'Cancelled' || input.note.length >= 3, 'Enter a cancellation reason.');
export const productionPlanSchema = z.object({
  id: z.uuid(),
  start_on: z.iso.date(),
  finish_on: z.iso.date(),
  status: productionStatusSchema,
  revision: z.number().int().positive(),
  note: z.string(),
  shortage_reason: z.string(),
  created_at: z.string(),
});
export const mixerBatchSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  product_id: z.uuid(),
  recipe_version_id: z.uuid(),
  sequence: z.number().int().positive(),
  target_gallons: z.literal(40),
  production_lot_id: z.uuid().nullable().optional(),
});
export const productionLotInputSchema = z.object({
  order_id: z.uuid(),
  product_id: z.uuid(),
  assigned_on: z.iso.date(),
});
export const productionLotSchema = z.object({
  id: z.uuid(),
  order_id: z.uuid(),
  product_id: z.uuid(),
  assigned_on: z.iso.date(),
  production_lot_code: z.string().regex(/^\d{5}$/),
  planned_gallons: z.number(),
  planned_batch_count: z.number().int(),
  status: z.enum(['Assigned', 'Cancelled']),
  assigned_at: z.string(),
});
export type ProductionPlan = z.infer<typeof productionPlanSchema>;
export type MixerBatch = z.infer<typeof mixerBatchSchema>;
export type ProductionLot = z.infer<typeof productionLotSchema>;

export const PRODUCTION_MESSAGES = [
  'Production plan changed; reload before trying again',
  'Choose an active customer order',
  'Production must finish by the customer needed date',
  'Save a production draft before confirming',
  'Save changed dates as a draft before confirming',
  'Only a draft can be confirmed',
  'Enter a reason for cancelling or revising production',
  'Explain how ingredient shortages will be resolved before confirming',
  'Save a draft production preparation before assigning lots',
  'A production lot is already assigned for this product',
];
