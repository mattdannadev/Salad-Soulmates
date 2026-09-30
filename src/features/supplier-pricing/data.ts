import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from '@/lib/database.types';
import { rows } from '@/lib/data';
import { rowSchemas } from '@/domain/master-data';
import { supplierPriceRowSchema, type SupplierPriceInput } from './domain';

const ingredientPricingRowSchema = rowSchemas.ingredients.extend({
  internal_code: z.string().nullable(),
});

const priceInsertResultSchema = z.object({ id: z.uuid() });
const supplierItemPricingStatusSchema = rowSchemas.supplier_items.extend({
  ingredients: z.object({ active: z.boolean() }),
  suppliers: z.object({ active: z.boolean() }),
});

export class SupplierPricingDataError extends Error {
  code: string;

  constructor(code: string, cause: unknown) {
    super('Supplier pricing data operation failed.', { cause });
    this.name = 'SupplierPricingDataError';
    this.code = code;
  }
}

export async function loadSupplierPricingData(db: SupabaseClient<Database>) {
  const [items, ingredients, suppliers, prices] = await Promise.all([
    rows(db, 'supplier_items', rowSchemas.supplier_items),
    rows(db, 'ingredients', ingredientPricingRowSchema),
    rows(db, 'suppliers', rowSchemas.suppliers),
    rows(db, 'supplier_item_prices', supplierPriceRowSchema),
  ]);
  return {
    items, ingredients, suppliers, prices,
  };
}

export async function findSupplierItem(
  db: SupabaseClient<Database>,
  supplierItemId: string,
) {
  const result = await db
    .from('supplier_items')
    .select('*, ingredients(active), suppliers(active)')
    .eq('id', supplierItemId)
    .maybeSingle();
  if (result.error) throw new SupplierPricingDataError(result.error.code, result.error);
  if (!result.data) return null;
  return supplierItemPricingStatusSchema.parse(result.data);
}

export async function insertSupplierPrice(
  db: SupabaseClient<Database>,
  input: SupplierPriceInput,
): Promise<string> {
  const result = await db
    .from('supplier_item_prices')
    .insert(input)
    .select('id')
    .single();
  if (result.error) throw new SupplierPricingDataError(result.error.code, result.error);
  return priceInsertResultSchema.parse(result.data).id;
}
