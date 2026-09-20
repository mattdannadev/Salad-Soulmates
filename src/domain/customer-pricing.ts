import { z } from 'zod';

const optionFields = {
  label: z.string().trim().min(1).max(120),
  packaging_mode: z.enum(['product_default', 'custom']),
  unit_name: z.string().trim().min(1).max(80),
  gallons_per_unit: z.number().finite().positive().max(1000000)
    .multipleOf(0.0001),
  unit_price: z.number().finite().min(0).max(1000000)
    .multipleOf(0.01),
  currency: z.literal('USD'),
  active: z.boolean(),
};
export const customerOptionInputSchema = z.object({
  id: z.uuid(),
  revision: z.number().int().nonnegative(),
  product_id: z.uuid(),
  customer_name: z.string().trim().min(1).max(120),
  ...optionFields,
});
export const customerOptionRowSchema = z.object({
  id: z.uuid(),
  customer_id: z.uuid(),
  product_id: z.uuid(),
  revision: z.number().int().positive(),
  ...optionFields,
});
export const customerRowSchema = z.object({ id: z.uuid(), name: z.string().min(1) });
export type Customer = z.infer<typeof customerRowSchema>;
export type CustomerOption = z.infer<typeof customerOptionRowSchema>;

/** Prices are recorded in USD; this formatter does not perform currency conversion. */
export function formatPrice(value: number) {
  return new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' })
    .format(z.number().finite().parse(value));
}
