import { z } from 'zod';

export const recordKindSchema = z.enum([
  'ingredient',
  'supplier',
  'pack',
  'allergen',
  'inventory',
  'receipt',
  'reference-option',
  'reference-option-delete',
  'uom-family',
  'uom',
  'uom-delete',
  'access-profile',
  'feedback',
  'feedback-status',
]);
export type RecordKind = z.infer<typeof recordKindSchema>;
export const referenceOptionSchema = z.object({
  id: z.uuid().optional(),
  list_code: z.string().min(1).max(80),
  code: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/),
  label_en: z.string().trim().min(1).max(100),
  label_es: z.string().trim().min(1).max(100),
  sort_order: z.number().int().min(0).max(10000),
  active: z.boolean(),
});
export const referenceOptionDeleteSchema = z.object({ id: z.uuid(), list_code: z.string().min(1).max(80), code: z.string().min(1).max(50) });
export const uomFamilySchema = z.object({
  code: z.string().trim().regex(/^[a-z][a-z0-9_]{0,49}$/),
  label_en: z.string().trim().min(1).max(100),
  label_es: z.string().trim().min(1).max(100),
  sort_order: z.number().int().min(0).max(10000),
  active: z.boolean(),
});
export const uomSchema = uomFamilySchema.extend({
  id: z.uuid().optional(),
  family_code: z.string().trim().regex(/^[a-z][a-z0-9_]{0,49}$/),
  measurement_system: z.enum(['metric', 'imperial', 'universal']),
  is_inventory_unit: z.boolean(),
  is_purchase_unit: z.boolean(),
}).refine((value) => value.is_inventory_unit || value.is_purchase_unit, 'Choose at least one usage.');
export const uomDeleteSchema = z.object({ id: z.uuid(), code: z.string().min(1).max(50) });
export const accessProfileSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500),
  base_role: z.enum(['admin', 'reviewer', 'worker', 'receiver']),
  active: z.boolean(),
  permission_codes: z.array(z.string().min(1)).max(100),
});
export const userProfileSchema = z.object({
  id: z.uuid(),
  first_name: z.string().trim().min(1).max(100),
  last_name: z.string().trim().min(1).max(100),
  display_name: z.string().trim().min(1).max(200),
  work_email: z.union([z.email().max(320), z.literal('')]).nullable(),
  facility_id: z.uuid(),
  access_profile_id: z.uuid(),
  preferred_locale: z.enum(['es', 'en']),
  active: z.boolean(),
});
export const loginEventSchema = z.object({
  event_type: z.enum(['signed_in', 'signed_out']),
  ip_address: z.string().trim().min(2).max(64)
    .nullable()
    .optional(),
  user_agent: z.string().max(1000).nullable().optional(),
});
export const deactivateUserAccessSchema = z.object({
  target_user_id: z.uuid(),
  reason: z.string().trim().min(3).max(500),
});
export const feedbackStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(['New', 'Reviewed', 'Resolved']),
  resolution_note: z.string().max(2000),
});
export function invalidInput(error: z.ZodError) {
  return { ok: false, message: error.issues[0]?.message ?? 'Invalid input.' };
}
