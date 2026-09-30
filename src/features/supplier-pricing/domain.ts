import { z } from 'zod';

const MONEY_LIMIT = 1_000_000_000;

export const supplierPriceInputSchema = z.object({
  supplier_item_id: z.uuid({ error: 'Choose a supplier item.' }),
  unit_price: z.coerce
    .number({ error: 'Enter a valid price.' })
    .positive('Price must be greater than zero.')
    .max(MONEY_LIMIT, 'Price is above the supported limit.')
    .multipleOf(0.01, 'Use no more than two decimal places.'),
  effective_on: z.iso.date({ error: 'Choose a valid effective date.' }),
  note: z.string().trim().max(1000, 'Note must be 1,000 characters or fewer.').default(''),
});

export type SupplierPriceInput = z.infer<typeof supplierPriceInputSchema>;

export const supplierPriceRowSchema = z.object({
  id: z.uuid(),
  supplier_item_id: z.uuid(),
  unit_price: z.number().finite().positive(),
  currency: z.literal('USD'),
  effective_on: z.iso.date(),
  note: z.string(),
  purchase_uom: z.string().min(1),
  pack_quantity: z.number().finite().positive(),
  pack_quantity_uom: z.string().min(1),
  created_at: z.iso.datetime({ offset: true }),
});

export type SupplierPrice = z.infer<typeof supplierPriceRowSchema>;

export interface SupplierPricingItem {
  id: string;
  ingredientId: string;
  ingredientName: string;
  ingredientCode: string | null;
  supplierId: string;
  supplierName: string;
  supplierSku: string;
  purchaseUom: string;
  packQuantity: number;
  packQuantityUom: string;
  preferred: boolean;
  active: boolean;
  currentPrice: SupplierPrice | null;
  nextPrice: SupplierPrice | null;
  prices: SupplierPrice[];
}

export interface SupplierPricingSource {
  items: {
    id: string;
    ingredient_id: string;
    supplier_id: string;
    supplier_sku: string;
    purchase_uom: string;
    pack_quantity: number;
    pack_quantity_uom: string;
    is_preferred: boolean;
    active: boolean;
  }[];
  ingredients: {
    id: string;
    name: string;
    internal_code: string | null;
    active: boolean;
  }[];
  suppliers: { id: string; name: string; active: boolean }[];
  prices: SupplierPrice[];
}

function comparePriceDescending(left: SupplierPrice, right: SupplierPrice): number {
  const effectiveOrder = right.effective_on.localeCompare(left.effective_on);
  return effectiveOrder || right.created_at.localeCompare(left.created_at);
}

/** Joins RLS-scoped catalog records and derives effective prices without losing history. */
export function buildSupplierPricingItems(
  source: SupplierPricingSource,
  currentDate: string,
): SupplierPricingItem[] {
  z.iso.date().parse(currentDate);
  const ingredientById = new Map(
    source.ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );
  const supplierById = new Map(source.suppliers.map((supplier) => [supplier.id, supplier]));
  const pricesByItem = new Map<string, SupplierPrice[]>();
  source.prices.forEach((price) => {
    const history = pricesByItem.get(price.supplier_item_id) ?? [];
    history.push(price);
    pricesByItem.set(price.supplier_item_id, history);
  });

  return source.items.flatMap((item) => {
    const ingredient = ingredientById.get(item.ingredient_id);
    const supplier = supplierById.get(item.supplier_id);
    if (!ingredient || !supplier) return [];
    const prices = [...(pricesByItem.get(item.id) ?? [])].sort(comparePriceDescending);
    return [{
      id: item.id,
      ingredientId: ingredient.id,
      ingredientName: ingredient.name,
      ingredientCode: ingredient.internal_code,
      supplierId: supplier.id,
      supplierName: supplier.name,
      supplierSku: item.supplier_sku,
      purchaseUom: item.purchase_uom,
      packQuantity: item.pack_quantity,
      packQuantityUom: item.pack_quantity_uom,
      preferred: item.is_preferred,
      active: item.active && ingredient.active && supplier.active,
      currentPrice: prices.find((price) => price.effective_on <= currentDate) ?? null,
      nextPrice: [...prices]
        .reverse()
        .find((price) => price.effective_on > currentDate) ?? null,
      prices,
    }];
  }).sort((left, right) => (
    left.ingredientName.localeCompare(right.ingredientName)
    || left.supplierName.localeCompare(right.supplierName)
    || left.supplierSku.localeCompare(right.supplierSku)
  ));
}
