// Pure planning rules; application workflows remain gated until master-data acceptance.
import { z } from 'zod';
const quantity = z.number().finite().nonnegative();
export function planBatches(requiredGallons: number, override?: { count: number; reason: string }) {
  quantity.parse(requiredGallons);
  if (override)
    z.object({ count: z.number().int().positive(), reason: z.string().trim().min(3) }).parse(
      override,
    );
  const calculated = Math.ceil(requiredGallons / 40);
  const batches = override?.count ?? calculated;
  return {
    requiredGallons,
    calculated,
    batches,
    spiceBuckets: batches,
    plannedGallons: batches * 40,
    overage: batches * 40 - requiredGallons,
    assumption: 'A-01: ceiling to full 40-gallon batches',
    overrideReason: override?.reason,
  };
}
export function availability(input: {
  required: number;
  onHand: number;
  otherCommitments: number;
  confirmedInbound: number;
}) {
  quantity.parse(input.required);
  quantity.parse(input.otherCommitments);
  quantity.parse(input.confirmedInbound);
  z.number().finite().parse(input.onHand);
  const projected = input.onHand + input.confirmedInbound - input.otherCommitments - input.required;
  return { ...input, projected, shortage: Math.max(0, -projected) };
}
export function purchaseUnits(
  shortage: number,
  unit: string,
  packQuantity: number,
  packUnit: string,
) {
  quantity.parse(shortage);
  z.number().finite().positive().parse(packQuantity);
  if (unit !== packUnit)
    throw new Error('Configure a validated unit conversion before purchasing.');
  const units = Math.ceil(shortage / packQuantity);
  return { units, quantity: units * packQuantity, overage: units * packQuantity - shortage };
}
