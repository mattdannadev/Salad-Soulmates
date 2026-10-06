import { z } from 'zod';

export const workOrderQueueKinds = [
  'pre_op', 'post_op', 'ingredient_prep', 'mixing', 'shipment_loading',
  'receiving', 'packaging', 'maintenance', 'cleaning', 'other',
] as const;

const workOrderTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  queue_kind: z.enum(workOrderQueueKinds),
  sequence: z.number().int().positive(),
});

export const workTypeSchema = z.object({
  id: z.uuid(),
  code: z.string(),
  name: z.string(),
  description: z.string(),
  active: z.boolean(),
  revision: z.number().int().positive(),
  work_order_types: z.array(workOrderTypeSchema),
});

export const processProfileSchema = z.object({
  id: z.uuid(),
  recipe_id: z.uuid(),
  work_type_id: z.uuid(),
  description: z.string().max(1000).default(''),
  active: z.boolean(),
  revision: z.number().int().positive(),
});

export const recipeProcessConfigurationSchema = z.object({
  work_types: z.array(workTypeSchema),
  process_profiles: z.array(processProfileSchema),
});

export const saveProcessProfileSchema = z.object({
  id: z.uuid(),
  expected_revision: z.number().int().nonnegative(),
  recipe_id: z.uuid(),
  work_type_id: z.uuid(),
  description: z.string().max(1000).default(''),
  active: z.boolean(),
}).strict();

export type WorkType = z.infer<typeof workTypeSchema>;
export type ProcessProfile = z.infer<typeof processProfileSchema>;
export type RecipeProcessConfiguration = z.infer<typeof recipeProcessConfigurationSchema>;
