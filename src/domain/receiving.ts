import { z } from 'zod';
import { receiptSchema, units } from './master-data';
import { QUANTITY_SCALE } from './format';

export const MAX_PACKAGES = 200;
export const packageSchema = z.object({
  quantity: z.number().positive().max(1000000).multipleOf(0.0001),
  supplier_barcode: z
    .string()
    .trim()
    .max(120)
    .refine((value) => value === '' || /^[!-~]+$/.test(value), 'Use a barcode without spaces.')
    .refine(
      (value) => !value.toUpperCase().startsWith('SSU-'),
      'SSU- is reserved for internal serials.',
    )
    .default(''),
});
export const packagesSchema = z
  .array(packageSchema)
  .min(1)
  .max(MAX_PACKAGES)
  .refine((packages) => {
    const barcodes = packages.map((entry) => entry.supplier_barcode).filter(Boolean);
    return new Set(barcodes).size === barcodes.length;
  }, 'Each supplier barcode must identify one physical package.');
const supplierItemSchema = z.preprocess(
  (value) => (value === '' || value === undefined ? null : value),
  z.uuid().nullable(),
);
export const serializeLineSchema = z.object({
  receipt_line_id: z.uuid(),
  supplier_item_id: supplierItemSchema,
  packages: packagesSchema,
});
export const serializedReceiptSchema = receiptSchema
  .extend({
    supplier_item_id: supplierItemSchema,
    packages: packagesSchema,
  })
  .refine(
    (value) => value.packages.reduce(
      (sum, entry) => sum + Math.round(entry.quantity * QUANTITY_SCALE),
      0,
    ) === Math.round(value.quantity * QUANTITY_SCALE),
    'Package quantities must equal the received quantity.',
  );
export const unitChangeSchema = z.object({
  id: z.uuid(),
  unit_id: z.uuid(),
  expected_revision: z.number().int().nonnegative(),
  remaining_quantity: z.number().min(0).max(1000000).multipleOf(0.0001),
  status: z.enum(['Available', 'Hold', 'Quarantined']),
  reason: z.string().trim().min(3).max(1000),
});
export const serializedUnitSchema = z.object({
  id: z.uuid(),
  receipt_id: z.uuid(),
  receipt_line_id: z.uuid(),
  ingredient_id: z.uuid(),
  ingredient_name: z.string(),
  supplier_name: z.string(),
  supplier_reference: z.string(),
  received_on: z.iso.date(),
  initial_quantity: z.number().finite().positive(),
  remaining_quantity: z.number().finite().nonnegative(),
  internal_code: z.string().regex(/^SSU-[0-9A-F-]{36}$/),
  supplier_barcode: z.string().nullable(),
  supplier_lot: z.string(),
  assigned_source_lot: z.string().nullable(),
  source_lot: z.string().nullable(),
  source_lot_origin: z.enum(['supplier_provided', 'salad_soulmates_assigned']).nullable(),
  expiration_date: z.iso.date().nullable(),
  uom: z.enum(units),
  status: z.enum(['Available', 'Hold', 'Quarantined']),
  availability: z.enum(['Available', 'Hold', 'Quarantined', 'Expired', 'Exhausted']),
  revision: z.number().int().nonnegative(),
});
export type SerializedUnit = z.infer<typeof serializedUnitSchema>;
export const unitEventSchema = unitChangeSchema.extend({
  quantity_delta: z.number().finite(),
  created_at: z.string(),
});
export const serializationRowSchema = z.object({
  id: z.uuid(),
  receipt_line_id: z.uuid(),
});

/** One line per physical package: quantity, optionally followed by | unique supplier barcode. */
export function parsePackageLines(input: unknown) {
  const text = z
    .string()
    .trim()
    .min(1, 'Enter the quantity in each physical package.')
    .max(30000)
    .parse(input);
  const entries = text.split(/\r?\n/).map((line) => {
    const [quantity, barcode = '', ...extra] = line.split('|');
    if (extra.length || !quantity?.trim()) throw new Error('Use quantity | barcode, one package per line.');
    return { quantity: Number(quantity.trim()), supplier_barcode: barcode.trim() };
  });
  return packagesSchema.parse(entries);
}
