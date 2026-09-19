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
  pack_quantity: z.number().positive().max(1000000),
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
    .regex(/^\/(app|worker)(\/|$)/)
    .max(500),
  comment: z.string().trim().min(1).max(2000),
  feedback_type: z.enum(['Suggestion', 'Issue', 'Positive', 'Question']),
});
export const receiptSchema = z.object({
  supplier_id: z.uuid(),
  ingredient_id: z.uuid(),
  quantity: z.number().positive().max(1000000),
  uom: z.enum(units),
  received_on: z.iso.date(),
  supplier_reference: z.string().trim().max(120),
  supplier_lot: z.string().trim().max(120),
  expiration_date: z.union([z.iso.date(), z.literal('')]),
  note: z.string().trim().max(1000),
  request_id: z.uuid(),
});

export type Ingredient = {
  id: string;
  name: string;
  category: string;
  default_uom: string;
  active: boolean;
  description: string;
  storage_notes: string;
};
export type Supplier = {
  id: string;
  name: string;
  contact_name: string;
  email: string;
  phone: string;
  lead_time_days: number;
  active: boolean;
};
export type SupplierItem = {
  id: string;
  ingredient_id: string;
  supplier_id: string;
  supplier_sku: string;
  purchase_uom: string;
  pack_quantity: number;
  pack_quantity_uom: string;
  is_preferred: boolean;
  active: boolean;
  notes: string;
};
export type InventoryEvent = {
  id: string;
  ingredient_id: string;
  event_type: string;
  quantity_delta: number;
  uom: string;
  reason_note: string;
  created_at: string;
};
export type Feedback = {
  id: string;
  route: string;
  comment: string;
  feedback_type: string;
  status: string;
  resolution_note: string;
  created_at: string;
};
export type Profile = {
  id: string;
  organization_id: string;
  facility_id: string;
  display_name: string;
  role: 'admin' | 'reviewer' | 'worker' | 'receiver';
  preferred_locale: 'es' | 'en';
  active: boolean;
  access_profile_id: string;
};
export type AccessRequest = {
  id: string;
  display_name: string;
  contact_kind: 'email' | 'phone';
  contact_value: string;
  preferred_locale: 'en' | 'es';
  requested_role: 'reviewer' | 'worker' | 'receiver';
  status: string;
  review_note: string;
  created_at: string;
  auth_user_id: string | null;
};
export type Receipt = {
  id: string;
  supplier_id: string;
  received_on: string;
  supplier_reference: string;
  note: string;
  created_at: string;
};
export type ReceiptLine = {
  id: string;
  receipt_id: string;
  ingredient_id: string;
  quantity: number;
  uom: string;
  supplier_lot: string;
  expiration_date: string | null;
};
export type ReferenceList = {
  organization_id: string;
  code: string;
  area: string;
  name_en: string;
  name_es: string;
  allow_custom_values: boolean;
};
export type ReferenceOption = {
  id: string;
  list_code: string;
  code: string;
  label_en: string;
  label_es: string;
  sort_order: number;
  active: boolean;
};
export type Permission = { code: string; area: string; label: string; description: string };
export type AccessProfile = {
  id: string;
  name: string;
  description: string;
  base_role: 'admin' | 'reviewer' | 'worker' | 'receiver';
  is_system: boolean;
  active: boolean;
};
export type ActionResult = { ok: boolean; message: string; id?: string };
