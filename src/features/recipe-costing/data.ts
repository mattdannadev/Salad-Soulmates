import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import { rows } from '@/lib/data';
import { rowSchemas } from '@/domain/master-data';
import {
  productRowSchema,
  recipeLineRowSchema,
  recipeRowSchema,
  recipeVersionRowSchema,
} from '@/domain/recipes';
import { customerOptionRowSchema, customerRowSchema } from '@/domain/customer-pricing';
import { supplierPriceRowSchema } from '@/features/supplier-pricing/domain';

/** Loads only RLS-visible records; business selection and costing stay in the service/domain. */
export default async function loadRecipeCostingData(db: SupabaseClient<Database>) {
  const [
    products,
    recipes,
    versions,
    lines,
    ingredients,
    suppliers,
    supplierItems,
    prices,
    customers,
    customerOptions,
  ] = await Promise.all([
    rows(db, 'products', productRowSchema),
    rows(db, 'recipes', recipeRowSchema),
    rows(db, 'recipe_versions', recipeVersionRowSchema),
    rows(db, 'recipe_lines', recipeLineRowSchema),
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'suppliers', rowSchemas.suppliers),
    rows(db, 'supplier_items', rowSchemas.supplier_items),
    rows(db, 'supplier_item_prices', supplierPriceRowSchema),
    rows(db, 'customers', customerRowSchema),
    rows(db, 'customer_product_options', customerOptionRowSchema),
  ]);
  return {
    products,
    recipes,
    versions,
    lines,
    ingredients,
    suppliers,
    supplierItems,
    prices,
    customers,
    customerOptions,
  };
}
