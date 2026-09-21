import { z } from 'zod';

const paginationSchema = z.object({
  page: z.number().int().nonnegative(),
  page_size: z.number().int().positive().max(200),
});

export const productionLotSearchSchema = paginationSchema.extend({
  items: z.array(z.object({
    id: z.uuid(),
    product_id: z.uuid(),
    product_name: z.string(),
    production_lot_code: z.string().regex(/^\d{5}$/),
    assigned_on: z.iso.date(),
    status: z.string(),
    planned_gallons: z.number(),
    planned_batch_count: z.number().int(),
  })),
});

const allocationSchema = z.object({
  usage_id: z.uuid(),
  quantity: z.number(),
  used_at: z.string(),
  source_lot: z.string(),
  batch_id: z.uuid(),
  batch_sequence: z.number().int(),
  ingredient_name: z.string(),
  serialized_unit_id: z.uuid(),
  package_serial: z.string(),
  supplier_barcode: z.string().nullable(),
  receipt_line_id: z.uuid(),
  source_lot_origin: z.enum(['supplier_provided', 'salad_soulmates_assigned']),
  receipt_id: z.uuid(),
  received_on: z.iso.date(),
  supplier_id: z.uuid(),
  supplier_name: z.string(),
});

export const backwardTraceSchema = paginationSchema.extend({
  lot: z.object({
    id: z.uuid(),
    product_id: z.uuid(),
    product_name: z.string(),
    production_lot_code: z.string().regex(/^\d{5}$/),
    assigned_on: z.iso.date(),
    status: z.string(),
  }),
  batches: z.array(z.object({
    id: z.uuid(),
    sequence: z.number().int(),
    target_gallons: z.number(),
    worksheet_execution_id: z.uuid().nullable(),
    worksheet_status: z.string().nullable(),
    opened_at: z.string().nullable(),
    completed_at: z.string().nullable(),
  })),
  allocations: z.array(allocationSchema),
});

export const forwardTraceSchema = paginationSchema.extend({
  matches: z.array(z.object({
    receipt_line_id: z.uuid(),
    source_lot: z.string(),
    source_lot_origin: z.enum(['supplier_provided', 'salad_soulmates_assigned']),
    ingredient_id: z.uuid(),
    ingredient_name: z.string(),
    supplier_id: z.uuid(),
    supplier_name: z.string(),
    receipt_id: z.uuid(),
    received_on: z.iso.date(),
  })),
  affected_batches: z.array(z.object({
    usage_id: z.uuid(),
    quantity: z.number(),
    used_at: z.string(),
    source_lot: z.string(),
    batch_id: z.uuid(),
    batch_sequence: z.number().int(),
    production_lot_id: z.uuid(),
    production_lot_code: z.string().regex(/^\d{5}$/),
    assigned_on: z.iso.date(),
    product_name: z.string(),
    serialized_unit_id: z.uuid(),
    package_serial: z.string(),
    supplier_barcode: z.string().nullable(),
    receipt_line_id: z.uuid(),
    source_lot_origin: z.enum(['supplier_provided', 'salad_soulmates_assigned']),
  })),
});

export const traceQuerySchema = z.object({
  product: z.uuid().optional(),
  lot: z.string().regex(/^\d{5}$/).optional(),
  productionLot: z.uuid().optional(),
  sourceLot: z.string().trim().min(1).max(120)
    .optional(),
  package: z.uuid().optional(),
});

export function lotOriginLabel(origin: 'supplier_provided' | 'salad_soulmates_assigned') {
  return origin === 'supplier_provided' ? 'Supplier-provided Source Lot' : 'Salad Soulmates-assigned Source Lot';
}
