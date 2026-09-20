import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import inventoryBalances from '@/domain/inventory';
import { rowSchemas } from '@/domain/master-data';
import type { Database } from './database.types';
import { rows } from './data';
import hasPermission from './permissions';

/** RLS scopes the ledger to the signed-in organization and facility. Null means no access. */
export default async function loadIngredientStock(db: SupabaseClient<Database>) {
  if (!await hasPermission(db, 'inventory.read')) return null;
  const events = await rows(db, 'inventory_events', rowSchemas.inventory_events);
  return inventoryBalances(events);
}
