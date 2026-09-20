import { z } from 'zod';

export const DEFAULT_LABEL_WIDTH = 3;
export const DEFAULT_LABEL_HEIGHT = 5;
export const LABELS_PER_BAG = 1;
const dimension = z.number().finite().min(1).max(12)
  .multipleOf(0.01);
const profileFields = z.object({
  product_id: z.uuid(),
  status: z.enum(['Draft', 'Approved']),
  bag_size_gallons: z.number().finite().positive().max(1000)
    .multipleOf(0.0001),
  bags_per_case: z.number().int().min(1).max(1000),
  label_width_inches: dimension,
  label_height_inches: dimension,
  display_name: z.string().trim().min(1).max(120),
  ingredient_statement: z.string().trim().max(4000),
});
export const packagingInputSchema = profileFields.extend({
  id: z.uuid(),
  expected_version: z.number().int().min(0).max(2147483646),
}).refine(
  (input) => input.status !== 'Approved' || input.ingredient_statement.length > 0,
  'Enter the approved ingredient statement before approval',
);
export const packagingVersionSchema = profileFields.extend({
  id: z.uuid(),
  version: z.number().int().positive(),
  labels_per_bag: z.literal(LABELS_PER_BAG),
  template_key: z.literal('bag-label-v1'),
  created_by: z.uuid(),
  created_at: z.iso.datetime({ offset: true }),
  approved_by: z.uuid().nullable(),
  approved_at: z.iso.datetime({ offset: true }).nullable(),
});
export type PackagingVersion = z.infer<typeof packagingVersionSchema>;
export const PACKAGING_MESSAGES = [
  'Product setup permission required',
  'Choose an active product',
  'Packaging setup changed; reload before trying again',
  'Packaging request already used; reload before trying again',
  'Enter the approved ingredient statement before approval',
];
