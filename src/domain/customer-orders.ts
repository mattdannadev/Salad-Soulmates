import { z } from 'zod';
import { MAX_BATCH_COUNT } from './purchasing';

const orderProductSchema = z.object({
  product_id: z.uuid(),
  customer_product_option_id: z.uuid().nullable().default(null),
  batch_count: z.number().int().min(1).max(MAX_BATCH_COUNT),
});
export const customerOrderInputSchema = z.object({
  id: z.uuid(),
  customer_name: z.string().trim().min(1).max(120),
  reference: z.string().trim().max(120),
  needed_on: z.iso.date(),
  products: z.array(orderProductSchema).min(1).max(100),
}).refine(
  (order) => new Set(order.products.map((product) => product.product_id)).size
    === order.products.length,
  'A product may appear only once.',
);
export const customerOrderRowSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  customer_name: z.string().min(1),
  reference: z.string(),
  needed_on: z.iso.date(),
  products: z.array(orderProductSchema).min(1),
  items: z.array(orderProductSchema.extend({
    product_name: z.string().min(1),
    recipe_version_id: z.uuid(),
    version_number: z.number().int().positive(),
    batch_gallons: z.literal(40),
    packaging_label: z.string(),
    unit_name: z.string(),
    gallons_per_unit: z.number().positive(),
    unit_price: z.number().nonnegative().nullable(),
    currency: z.literal('USD'),
    unit_count: z.number().int().positive(),
    line_total: z.number().nonnegative().max(1000000000000).nullable(),
  })).min(1),
  created_at: z.string(),
});
export type CustomerOrder = z.infer<typeof customerOrderRowSchema>;

export function customerOrderLabel(order: CustomerOrder) {
  return `${order.customer_name} · ${order.reference || order.id.slice(0, 8)}`;
}
