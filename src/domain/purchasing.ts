import { z } from 'zod';
import { QUANTITY_SCALE } from './format';

export const MAX_BATCH_COUNT = 10000;
export const MAX_PURCHASE_UNITS = 1000000;
const quantity = z.number().finite().min(0).max(1000000000);
export const materialPlanInputSchema = z
  .object({
    id: z.uuid(),
    name: z.string().trim().min(1).max(120),
    needed_on: z.iso.date(),
    batches: z
      .array(
        z.object({
          recipe_version_id: z.uuid(),
          batch_count: z.number().int().min(1).max(MAX_BATCH_COUNT),
        }),
      )
      .min(1)
      .max(100),
  })
  .refine(
    (plan) => new Set(plan.batches.map((batch) => batch.recipe_version_id)).size
      === plan.batches.length,
    'A recipe version may appear only once.',
  );
export const materialRequirementSchema = z.object({
  ingredient_id: z.uuid(),
  ingredient_name: z.string().min(1),
  uom: z.string().min(1),
  required: quantity.positive(),
  contributions: z.array(
    z.object({
      recipe_line_id: z.uuid(),
      recipe_version_id: z.uuid(),
      product_name: z.string(),
      version_number: z.number().int().positive(),
      batch_count: z.number().int().positive(),
      per_batch: quantity.positive(),
      quantity: quantity.positive(),
    }),
  ),
});
export const materialAvailabilitySchema = materialRequirementSchema.extend({
  on_hand: z.number().finite(),
  other_commitments: quantity,
  confirmed_inbound: quantity,
  projected: z.number().finite(),
  shortage: quantity,
});
export type MaterialAvailability = z.infer<typeof materialAvailabilitySchema>;
export const materialPlanRowSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  needed_on: z.iso.date(),
  batches: z.array(
    z.object({
      recipe_version_id: z.uuid(),
      batch_count: z.number().int().positive(),
    }),
  ),
  requirements: z.array(materialRequirementSchema),
  status: z.enum(['Active', 'Cancelled']),
  created_at: z.string(),
});
export type MaterialPlan = z.infer<typeof materialPlanRowSchema>;
const purchaseLineInputSchema = z.object({
  ingredient_id: z.uuid(),
  supplier_item_id: z.uuid(),
  purchase_units: z.number().int().min(1).max(MAX_PURCHASE_UNITS),
  override_reason: z.string().trim().max(1000),
});
const purchaseDraftBaseSchema = z.object({
  id: z.uuid(),
  supplier_id: z.uuid(),
  expected_on: z.iso.date(),
  lines: z
    .array(purchaseLineInputSchema)
    .min(1, 'Choose at least one ingredient and enter its whole-pack quantity.')
    .max(200),
});
export const purchaseDraftInputSchema = z.discriminatedUnion('kind', [
  purchaseDraftBaseSchema.extend({ kind: z.literal('order'), material_plan_id: z.uuid() }),
  purchaseDraftBaseSchema.extend({ kind: z.literal('standalone') }),
])
  .refine(
    (draft) => new Set(draft.lines.map((line) => line.ingredient_id)).size === draft.lines.length,
    'An ingredient may appear only once per draft.',
  );
export const purchaseStatusInputSchema = z
  .object({
    id: z.uuid(),
    revision: z.number().int().positive(),
    status: z.enum(['Confirmed', 'Cancelled']),
    reference: z.string().trim().max(120),
    note: z.string().trim().max(1000),
  })
  .refine(
    (draft) => draft.status !== 'Confirmed' || draft.reference.length > 0,
    'Enter the external order reference before confirming inbound.',
  )
  .refine(
    (draft) => draft.status !== 'Cancelled' || draft.note.length >= 3,
    'Enter a cancellation reason.',
  );
export const purchaseDraftRowSchema = z.object({
  id: z.uuid(),
  material_plan_id: z.uuid().nullable(),
  supplier_id: z.uuid(),
  expected_on: z.iso.date(),
  status: z.enum(['Draft', 'Confirmed', 'Cancelled']),
  reference: z.string(),
  note: z.string(),
  revision: z.number().int().positive(),
  created_at: z.string(),
});
export type PurchaseDraft = z.infer<typeof purchaseDraftRowSchema>;
export const purchaseLineRowSchema = z.object({
  id: z.uuid(),
  purchase_draft_id: z.uuid(),
  ingredient_id: z.uuid(),
  supplier_item_id: z.uuid(),
  ingredient_name: z.string(),
  supplier_sku: z.string(),
  uom: z.string(),
  purchase_uom: z.string(),
  pack_quantity: quantity.positive(),
  raw_shortage: quantity.positive(),
  recommended_units: z.number().int().positive(),
  purchase_units: z.number().int().positive(),
  quantity: quantity.positive(),
  override_reason: z.string(),
});
export type PurchaseLine = z.infer<typeof purchaseLineRowSchema>;

/** Select a preferred active pack, or the sole active choice; never guess between suppliers. */
export function selectSupplierPack<
  T extends { id: string; active: boolean; is_preferred: boolean },
>(items: T[]): T | undefined {
  const active = items.filter((item) => item.active);
  const preferred = active.filter((item) => item.is_preferred);
  if (preferred.length > 1) throw new Error('Multiple preferred supplier packs need correction.');
  return preferred[0] ?? (active.length === 1 ? active[0] : undefined);
}

/** Four-decimal integer arithmetic prevents an extra pack caused by floating-point division. */
export function recommendPurchase(shortageInput: number, packInput: number) {
  const scale = QUANTITY_SCALE;
  const shortage = quantity.multipleOf(1 / scale).parse(shortageInput);
  const pack = quantity
    .positive()
    .multipleOf(1 / scale)
    .parse(packInput);
  const shortageTicks = Math.round(shortage * scale);
  const packTicks = Math.round(pack * scale);
  const units = Math.ceil(shortageTicks / packTicks);
  const purchasedTicks = units * packTicks;
  if (!Number.isSafeInteger(purchasedTicks)) throw new Error('Purchase exceeds supported precision.');
  return {
    units,
    quantity: purchasedTicks / scale,
    overage: (purchasedTicks - shortageTicks) / scale,
  };
}

export interface InboundChoice {
  id: string;
  ingredient_id: string;
  supplier_id: string;
  supplier_item_id: string;
  label: string;
  remaining: number;
}

interface StandalonePackChoice {
  id: string;
  ingredient_id: string;
  is_preferred: boolean;
}

/** Convert contextual whole-pack selections into one purchase line per ingredient. */
export function standalonePurchaseLines(
  packs: StandalonePackChoice[],
  unitsByIngredient: Readonly<Record<string, number>>,
  selectedPacksByIngredient: Readonly<Record<string, string | undefined>>,
  reason: string,
) {
  return Object.entries(unitsByIngredient).flatMap(([ingredientId, purchaseUnits]) => {
    if (!Number.isInteger(purchaseUnits) || purchaseUnits <= 0) return [];
    const ingredientPacks = packs.filter((pack) => pack.ingredient_id === ingredientId);
    const selectedPackId = selectedPacksByIngredient[ingredientId];
    const preferred = ingredientPacks.filter((pack) => pack.is_preferred);
    let selectedPack: StandalonePackChoice | undefined;
    if (selectedPackId) {
      selectedPack = ingredientPacks.find((pack) => pack.id === selectedPackId);
    } else if (preferred.length === 1) {
      [selectedPack] = preferred;
    } else if (ingredientPacks.length === 1) {
      [selectedPack] = ingredientPacks;
    }
    return selectedPack ? [{
      ingredient_id: ingredientId,
      supplier_item_id: selectedPack.id,
      purchase_units: purchaseUnits,
      override_reason: reason,
    }] : [];
  });
}

/** Derive outstanding supply from immutable receipts; confirmed orders never add owned stock. */
export function outstandingInbound(
  drafts: PurchaseDraft[],
  lines: PurchaseLine[],
  receipts: { purchase_draft_line_id: string | null; quantity: number }[],
): InboundChoice[] {
  return lines.flatMap((line) => {
    const draft = drafts.find((candidate) => candidate.id === line.purchase_draft_id);
    if (!draft || draft.status !== 'Confirmed') return [];
    const receivedTicks = receipts
      .filter((receipt) => receipt.purchase_draft_line_id === line.id)
      .reduce(
        (sum, receipt) => sum + Math.round(quantity.parse(receipt.quantity) * QUANTITY_SCALE),
        0,
      );
    const remaining = (Math.round(line.quantity * QUANTITY_SCALE) - receivedTicks) / QUANTITY_SCALE;
    if (remaining < 0) throw new Error('Received quantity exceeds the confirmed purchase.');
    return remaining === 0
      ? []
      : [
        {
          id: line.id,
          ingredient_id: line.ingredient_id,
          supplier_id: draft.supplier_id,
          supplier_item_id: line.supplier_item_id,
          label: `${draft.reference} · ${line.ingredient_name} · ${remaining} ${line.uom}`,
          remaining,
        },
      ];
  });
}
