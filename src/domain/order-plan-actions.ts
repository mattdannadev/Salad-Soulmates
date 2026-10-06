import { z } from 'zod';

export const orderPlanOperationSchema = z.enum(['preview-production', 'create-production', 'preview-delete', 'delete-order']);
export type OrderPlanOperation = z.infer<typeof orderPlanOperationSchema>;
export const productionProductDaysSchema = z.object({
  product_id: z.uuid(),
  workdays: z.number().int().min(1).max(90),
});
export const productionAdjustmentsSchema = z.object({
  production_start_on: z.iso.date().optional(),
  product_days: z.array(productionProductDaysSchema).max(100).optional(),
});
export type ProductionAdjustments = z.infer<typeof productionAdjustmentsSchema>;
export const orderPlanInputSchema = z.object({
  order_id: z.uuid(),
  fingerprint: z.string().min(1).optional(),
  confirmation: z.string().min(1).optional(),
  ...productionAdjustmentsSchema.shape,
});
export const productionWorkProposalSchema = z.object({
  order_id: z.uuid(),
  reference: z.string(),
  pickup_on: z.string(),
  start_on: z.string(),
  finish_on: z.string(),
  timezone: z.string(),
  fingerprint: z.string().min(1),
  can_confirm: z.boolean(),
  existing_plan: z.boolean(),
  total_batches: z.number().nonnegative(),
  product_days: z.array(productionProductDaysSchema
    .extend({ product_name: z.string() })).optional(),
  events: z.array(z.object({
    kind: z.enum(['ingredient_prep', 'mixing', 'packaging']),
    product_id: z.uuid(),
    product_name: z.string(),
    title: z.string(),
    work_on: z.string(),
    start_at: z.string(),
    end_at: z.string(),
    all_day: z.boolean(),
    batch_count: z.number().nonnegative(),
    required_worker_count: z.number().nonnegative(),
    estimated_minutes: z.number().nullable(),
  })),
  warnings: z.array(z.string()),
});
export const orderDeletePreviewSchema = z.object({
  order_id: z.uuid(),
  reference: z.string(),
  fingerprint: z.string().min(1),
  can_delete: z.boolean(),
  counts: z.array(z.object({ table_name: z.string(), count: z.number().int().nonnegative() })),
  warnings: z.array(z.string()),
});
export type ProductionWorkProposal = z.infer<typeof productionWorkProposalSchema>;
export type OrderDeletePreview = z.infer<typeof orderDeletePreviewSchema>;
export type OrderPlanActionResult = { ok: false; message: string }
  | { ok: true; kind: 'proposal'; data: ProductionWorkProposal }
  | { ok: true; kind: 'delete-preview'; data: OrderDeletePreview }
  | { ok: true; kind: 'saved'; message: string };

/** Friendly transaction labels keep persistence table names out of confirmations. */
export function orderRecordLabel(tableName: string, es = false) {
  const labels: Record<string, [string, string]> = {
    customer_orders: ['Orders', 'Pedidos'],
    customer_order_items: ['Order product lines', 'Productos pedidos'],
    material_plans: ['Material plans', 'Planes de materiales'],
    material_plan_items: ['Material requirements', 'Requisitos de materiales'],
    production_plans: ['Production plans', 'Planes de producción'],
    order_production_plans: ['Production plans', 'Planes de producción'],
    order_mixer_batches: ['Mixer batches', 'Lotes de mezcla'],
    order_spice_preparations: ['Ingredient preparations', 'Preparaciones de ingredientes'],
    mixer_batches: ['Mixer batches', 'Lotes de mezcla'],
    spice_preparations: ['Ingredient preparations', 'Preparaciones de ingredientes'],
    production_lots: ['Production lots', 'Lotes de producción'],
    work_orders: ['Work orders', 'Órdenes de trabajo'],
    workforce_schedule_events: ['Planner events', 'Eventos del planificador'],
    work_order_dependencies: ['Work dependencies', 'Dependencias de trabajo'],
    workforce_schedule_dependencies: ['Planner dependencies', 'Dependencias del planificador'],
    purchases: ['Purchases', 'Compras'],
    purchase_orders: ['Purchase orders', 'Órdenes de compra'],
    shipments: ['Shipments', 'Envíos'],
    shipment_items: ['Shipment items', 'Artículos de envío'],
    inventory_transactions: ['Inventory records', 'Registros de inventario'],
  };
  return labels[tableName]?.[es ? 1 : 0] ?? tableName.replaceAll('_', ' ');
}
