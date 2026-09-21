import { z } from 'zod';

export const units = ['lb', 'oz', 'gal', 'each'] as const;
export const ingredientSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  category: z.string().trim().min(1).max(50),
  default_uom: z.enum(units),
  spanish_name: z.string().trim().max(120),
  description: z.string().trim().max(1000),
  storage_notes: z.string().trim().max(1000),
  active: z.boolean(),
  allergen_ids: z.array(z.uuid()).max(30),
});
export const supplierSchema = z.object({
  id: z.uuid().optional(),
  name: z.string().trim().min(1).max(120),
  contact_name: z.string().trim().max(120),
  email: z.union([z.email(), z.literal('')]),
  phone: z.string().max(40),
  lead_time_days: z.number().int().min(0).max(365),
  active: z.boolean(),
});
export const packSchema = z.object({
  id: z.uuid().optional(),
  ingredient_id: z.uuid(),
  supplier_id: z.uuid(),
  supplier_sku: z.string().trim().max(100),
  purchase_uom: z.enum(['pail', 'bag', 'case', 'each']),
  pack_quantity: z.number().positive().max(1000000).multipleOf(0.0001),
  pack_quantity_uom: z.enum(units),
  is_preferred: z.boolean(),
  active: z.boolean(),
  notes: z.string().trim().max(1000),
});
export const inventorySchema = z
  .object({
    ingredient_id: z.uuid(),
    event_type: z.enum(['OpeningBalance', 'Adjustment']),
    quantity_delta: z
      .number()
      .finite()
      .min(-1000000)
      .max(1000000)
      .multipleOf(0.0001)
      .refine((n) => n !== 0, 'Enter a non-zero quantity.'),
    uom: z.enum(units),
    reason_note: z.string().trim().min(3).max(1000),
    request_id: z.uuid(),
  })
  .refine(
    (v) => v.event_type !== 'OpeningBalance' || v.quantity_delta > 0,
    'Opening balance must be positive.',
  );
export const feedbackSchema = z.object({
  route: z
    .string()
    .regex(/^\/(app|worker|receiving)(\/|$)/)
    .max(500),
  comment: z.string().trim().min(1).max(2000),
  feedback_type: z.enum(['Suggestion', 'Issue', 'Positive', 'Question']),
});
export const receiptSchema = z.object({
  purchase_draft_line_id: z.preprocess(
    (value) => (value === '' ? null : value),
    z.uuid().nullable().optional(),
  ),
  supplier_id: z.uuid(),
  ingredient_id: z.uuid(),
  quantity: z.number().positive().max(1000000).multipleOf(0.0001),
  uom: z.enum(units),
  received_on: z.iso.date(),
  supplier_reference: z.string().trim().max(120),
  supplier_lot: z.string().max(120),
  expiration_date: z.union([z.iso.date(), z.literal('')]),
  note: z.string().trim().max(1000),
  request_id: z.uuid(),
});

export const ingredientRowSchema = z.object({
  traceability_mode: z.enum(['future_required', 'not_required']).default('future_required'),
  id: z.uuid(),
  name: z.string(),
  category: z.string(),
  default_uom: z.string(),
  active: z.boolean(),
  description: z.string(),
  storage_notes: z.string(),
});
export type Ingredient = z.infer<typeof ingredientRowSchema>;
export const supplierRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  contact_name: z.string(),
  email: z.string(),
  phone: z.string(),
  lead_time_days: z.number().int().nullable(),
  active: z.boolean(),
});
export type Supplier = z.infer<typeof supplierRowSchema>;
export const supplierItemRowSchema = z.object({
  id: z.uuid(),
  ingredient_id: z.uuid(),
  supplier_id: z.uuid(),
  supplier_sku: z.string(),
  purchase_uom: z.string(),
  pack_quantity: z.number().finite(),
  pack_quantity_uom: z.string(),
  is_preferred: z.boolean(),
  active: z.boolean(),
  notes: z.string(),
});
export type SupplierItem = z.infer<typeof supplierItemRowSchema>;
export const inventoryEventRowSchema = z.object({
  id: z.uuid(),
  ingredient_id: z.uuid(),
  event_type: z.string(),
  quantity_delta: z.number().finite(),
  uom: z.string(),
  reason_note: z.string(),
  created_at: z.string(),
});
export type InventoryEvent = z.infer<typeof inventoryEventRowSchema>;
export const feedbackRowSchema = z.object({
  id: z.uuid(),
  route: z.string(),
  comment: z.string(),
  feedback_type: z.string(),
  status: z.string(),
  resolution_note: z.string(),
  created_at: z.string(),
});
export type Feedback = z.infer<typeof feedbackRowSchema>;
export const profileRowSchema = z.object({
  id: z.uuid(),
  organization_id: z.uuid(),
  facility_id: z.uuid(),
  display_name: z.string(),
  role: z.enum(['admin', 'reviewer', 'worker', 'receiver']),
  preferred_locale: z.enum(['es', 'en']),
  active: z.boolean(),
  access_profile_id: z.uuid(),
});
export type Profile = z.infer<typeof profileRowSchema>;
export const accessRequestRowSchema = z.object({
  id: z.uuid(),
  display_name: z.string(),
  contact_kind: z.enum(['email', 'phone']),
  contact_value: z.string(),
  preferred_locale: z.enum(['en', 'es']),
  requested_role: z.enum(['reviewer', 'worker', 'receiver']),
  status: z.string(),
  review_note: z.string(),
  created_at: z.string(),
  auth_user_id: z.uuid().nullable(),
});
export type AccessRequest = z.infer<typeof accessRequestRowSchema>;
export const receiptRowSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  received_on: z.string(),
  supplier_reference: z.string(),
  note: z.string(),
  created_at: z.string(),
});
export type Receipt = z.infer<typeof receiptRowSchema>;
export const receiptLineRowSchema = z.object({
  assigned_source_lot: z.string().nullable().default(null),
  purchase_draft_line_id: z.uuid().nullable().default(null),
  id: z.uuid(),
  receipt_id: z.uuid(),
  ingredient_id: z.uuid(),
  quantity: z.number().finite(),
  uom: z.string(),
  supplier_lot: z.string(),
  source_lot_origin: z
    .enum(['supplier_provided', 'salad_soulmates_assigned'])
    .nullable()
    .default(null),
  expiration_date: z.string().nullable(),
});
export type ReceiptLine = z.infer<typeof receiptLineRowSchema>;
export const referenceListRowSchema = z.object({
  organization_id: z.uuid(),
  code: z.string(),
  area: z.string(),
  name_en: z.string(),
  name_es: z.string(),
  allow_custom_values: z.boolean(),
});
export type ReferenceList = z.infer<typeof referenceListRowSchema>;
export const referenceOptionRowSchema = z.object({
  id: z.uuid(),
  list_code: z.string(),
  code: z.string(),
  label_en: z.string(),
  label_es: z.string(),
  sort_order: z.number().finite(),
  active: z.boolean(),
});
export type ReferenceOption = z.infer<typeof referenceOptionRowSchema>;
export interface Permission {
  code: string;
  area: string;
  label: string;
  description: string;
}
export const accessProfileRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  description: z.string(),
  base_role: z.enum(['admin', 'reviewer', 'worker', 'receiver']),
  is_system: z.boolean(),
  active: z.boolean(),
});
export type AccessProfile = z.infer<typeof accessProfileRowSchema>;
export interface ActionResult {
  ok: boolean;
  message: string;
  id?: string;
}

export const rowSchemas = {
  ingredients: ingredientRowSchema,
  suppliers: supplierRowSchema,
  supplier_items: supplierItemRowSchema,
  inventory_events: inventoryEventRowSchema,
  feedback_items: feedbackRowSchema,
  profiles: profileRowSchema,
  access_requests: accessRequestRowSchema,
  inventory_receipts: receiptRowSchema,
  inventory_receipt_lines: receiptLineRowSchema,
  reference_lists: referenceListRowSchema,
  reference_options: referenceOptionRowSchema,
  permissions: z.object({
    code: z.string(),
    area: z.string(),
    label: z.string(),
    description: z.string(),
  }),
  access_profiles: accessProfileRowSchema,
  allergens: z.object({ id: z.uuid(), name: z.string() }),
};
