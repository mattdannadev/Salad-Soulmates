import { z } from 'zod';

export const recordKindSchema = z.enum([
  'ingredient',
  'supplier',
  'pack',
  'allergen',
  'inventory',
  'receipt',
  'reference-option',
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
export const accessProfileSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(2).max(100),
  description: z.string().trim().max(500),
  base_role: z.enum(['admin', 'reviewer', 'worker', 'receiver']),
  active: z.boolean(),
  permission_codes: z.array(z.string().min(1)).max(100),
});
export const feedbackStatusSchema = z.object({
  id: z.uuid(),
  status: z.enum(['New', 'Reviewed', 'Resolved']),
  resolution_note: z.string().max(2000),
});
export function invalidInput(error: z.ZodError) {
  return { ok: false, message: error.issues[0]?.message ?? 'Invalid input.' };
}
