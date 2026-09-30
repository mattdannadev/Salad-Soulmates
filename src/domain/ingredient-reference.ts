import { z } from 'zod';
import inventoryBalances from './inventory';
import { outstandingInbound, type MaterialPlan, type PurchaseDraft, type PurchaseLine } from './purchasing';

const receiptSchema = z.object({
  purchase_draft_line_id: z.uuid().nullable(),
  quantity: z.number().finite().nonnegative(),
});

/** Derives one facility's reference quantities without treating an ingredient as a stock record. */
export function ingredientReferenceQuantities(
  ingredientId: string,
  events: { ingredient_id: string; quantity_delta: number | string }[],
  drafts: PurchaseDraft[],
  lines: PurchaseLine[],
  receipts: { purchase_draft_line_id: string | null; quantity: number }[],
  plans: MaterialPlan[],
) {
  const safeIngredientId = z.uuid().parse(ingredientId);
  const safeReceipts = receiptSchema.array().parse(receipts);
  const onHand = inventoryBalances(events)[safeIngredientId] ?? 0;
  const inbound = outstandingInbound(drafts, lines, safeReceipts)
    .filter((line) => line.ingredient_id === safeIngredientId)
    .reduce((total, line) => total + line.remaining, 0);
  const committed = plans
    .filter((plan) => plan.status === 'Active')
    .flatMap((plan) => plan.requirements)
    .filter((requirement) => requirement.ingredient_id === safeIngredientId)
    .reduce((total, requirement) => total + requirement.required, 0);
  return { onHand, inbound, committed };
}
