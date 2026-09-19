import { z } from 'zod';
import { QUANTITY_SCALE } from './format';

const eventSchema = z.object({
  ingredient_id: z.string().min(1),
  quantity_delta: z.union([
    z.number().finite().multipleOf(1 / QUANTITY_SCALE),
    z
      .string()
      .regex(/^-?\d+(\.\d{1,4})?$/)
      .transform(Number),
  ]),
});
/** Integer ticks preserve the database's four-decimal quantities without display drift. */
export default function inventoryBalances(
  events: { ingredient_id: string; quantity_delta: number | string }[],
) {
  const validated = z.array(eventSchema).parse(events);
  const balances = new Map<string, number>();
  validated.forEach((event) => {
    const ticks = Math.round(event.quantity_delta * QUANTITY_SCALE);
    const total = (balances.get(event.ingredient_id) ?? 0) + ticks;
    if (!Number.isSafeInteger(total)) throw new Error('Inventory quantity exceeds safe display precision.');
    balances.set(event.ingredient_id, total);
  });
  return Object.fromEntries([...balances].map(([id, ticks]) => [id, ticks / QUANTITY_SCALE]));
}
