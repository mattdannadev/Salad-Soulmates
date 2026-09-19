import { z } from 'zod';

const positiveQuantity = z.number().finite().positive();
export const productRowSchema = z.object({
  id: z.uuid(),
  name: z.string().trim().min(1),
  product_code: z.string().nullable(),
  standard_batch_gallons: positiveQuantity,
  bag_size_gallons: positiveQuantity,
  bags_per_case: z.number().int().positive(),
  approved_ingredient_statement: z.string().nullable(),
  active: z.boolean(),
});
export const recipeRowSchema = z.object({
  id: z.uuid(),
  product_id: z.uuid(),
  name: z.string().trim().min(1),
  active_version_id: z.uuid().nullable(),
});
export const recipeVersionRowSchema = z.object({
  id: z.uuid(),
  recipe_id: z.uuid(),
  version_number: z.number().int().positive(),
  status: z.enum(['Draft', 'Released', 'Retired']),
  target_yield_gallons: positiveQuantity,
  released_at: z.iso.datetime({ offset: true }).nullable(),
});
export const recipeSectionRowSchema = z.object({
  id: z.uuid(),
  recipe_version_id: z.uuid(),
  name: z.string().trim().min(1),
  sequence: z.number().int().positive(),
});
export const recipeLineRowSchema = z.object({
  id: z.uuid(),
  recipe_version_id: z.uuid(),
  recipe_section_id: z.uuid(),
  ingredient_id: z.uuid(),
  sequence: z.number().int().positive(),
  display_measurement: z.string().trim().min(1),
  normalized_quantity: positiveQuantity,
  normalized_uom: z.enum(['lb', 'oz', 'gal', 'each']),
  operator_note: z.string().nullable(),
});
export const recipeQualityRuleRowSchema = z.object({
  id: z.uuid(),
  recipe_version_id: z.uuid(),
  name: z.string().trim().min(1),
  min_value: z.number().finite(),
  max_value: z.number().finite(),
  uom: z.string(),
  instructions: z.string(),
  sequence: z.number().int().positive(),
}).refine((rule) => rule.max_value >= rule.min_value, 'Invalid quality-control range.');

/** An explicit version must belong to this recipe; an active pointer must remain valid. */
export function selectRecipeVersion(
  recipeInput: unknown,
  versionsInput: unknown,
  requestedVersion?: string,
) {
  const recipe = recipeRowSchema.parse(recipeInput);
  const versions = recipeVersionRowSchema.array().parse(versionsInput)
    .filter((version) => version.recipe_id === recipe.id)
    .sort((left, right) => right.version_number - left.version_number);
  if (requestedVersion !== undefined) {
    const versionId = z.uuid().parse(requestedVersion);
    return versions.find((version) => version.id === versionId) ?? null;
  }
  if (recipe.active_version_id) {
    const active = versions.find((version) => version.id === recipe.active_version_id);
    if (!active || active.status !== 'Released') {
      throw new Error('The active recipe version is missing or is not released.');
    }
    return active;
  }
  return versions[0] ?? null;
}
