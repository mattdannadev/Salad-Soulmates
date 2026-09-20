import { z } from 'zod';

export const shippingDraftInputSchema = z.strictObject({
  id: z.uuid(),
  order_id: z.uuid(),
  planned_on: z.iso.date(),
  method: z.enum(['Shipment', 'Pickup']),
  note: z.string().trim().max(1000),
  lines: z.array(z.strictObject({
    product_id: z.uuid(),
    quantity: z.number().int().positive().max(1000000000),
  })).min(1).max(100),
}).refine(
  (draft) => new Set(draft.lines.map((line) => line.product_id)).size === draft.lines.length,
  'Include each product only once.',
);

export const shippingDraftRowSchema = shippingDraftInputSchema.safeExtend({
  created_at: z.iso.datetime({ offset: true }),
}).strip();
export type ShippingDraftInput = z.infer<typeof shippingDraftInputSchema>;
export type ShippingDraft = z.infer<typeof shippingDraftRowSchema>;

export const SHIPPING_MESSAGES = [
  'Choose an active customer order',
  'Draft quantity exceeds ordered quantity',
  'Choose products from this customer order',
  'This draft ID was already used with different details',
];
