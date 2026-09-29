import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { serializedUnitSchema } from '@/domain/receiving';
import type { Database } from './database.types';
import { readResult } from './data';

/** Filter on the server under RLS; never download the entire serialized inventory. */
export default async function loadSerializedUnits(
  db: SupabaseClient<Database>,
  filters: {
    search_text?: string;
    receipt_filter?: string;
    unit_filter?: string;
    ingredient_filter?: string;
    supplier_filter?: string;
    availability_filter?: 'Available' | 'Hold' | 'Quarantined' | 'Expired' | 'Exhausted';
    expiry_filter?: 'expired' | 'soon' | 'later' | 'undated';
    balance_filter?: 'positive' | 'partial' | 'empty';
    sort_order?: 'newest' | 'oldest' | 'ingredient' | 'expiry' | 'balance';
  } = {},
) {
  const input = z.object({
    search_text: z.string().trim().max(200).optional(),
    receipt_filter: z.uuid().optional(),
    unit_filter: z.uuid().optional(),
    ingredient_filter: z.uuid().optional(),
    supplier_filter: z.uuid().optional(),
    availability_filter: z.enum(['Available', 'Hold', 'Quarantined', 'Expired', 'Exhausted']).optional(),
    expiry_filter: z.enum(['expired', 'soon', 'later', 'undated']).optional(),
    balance_filter: z.enum(['positive', 'partial', 'empty']).optional(),
    sort_order: z.enum(['newest', 'oldest', 'ingredient', 'expiry', 'balance']).optional(),
  }).parse(filters);
  return readResult(
    await db.rpc('find_serialized_units', input),
    z.array(serializedUnitSchema),
    'serialized_inventory_lookup',
  );
}

const packageFilterOptionSchema = z.object({ id: z.uuid(), name: z.string() });

/** Read only accessible master data for directory facets; package rows stay in the RPC. */
export async function loadPackageFilterOptions(db: SupabaseClient<Database>) {
  const [ingredientResult, supplierResult] = await Promise.all([
    db.from('ingredients').select('id,name').order('name'),
    db.from('suppliers').select('id,name').order('name'),
  ]);
  return {
    ingredients: readResult(ingredientResult, z.array(packageFilterOptionSchema), 'package_filter_ingredients'),
    suppliers: readResult(supplierResult, z.array(packageFilterOptionSchema), 'package_filter_suppliers'),
  };
}
