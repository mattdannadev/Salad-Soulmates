import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Database } from './database.types';
import { operationError } from './operation-error';
import { reportApplicationError } from './error-reporting';

export type SetupCountTable = 'ingredients' | 'suppliers' | 'supplier_items'
  | 'products' | 'recipe_versions' | 'customer_product_options' | 'customer_orders';

/** Counts only rows visible to the signed-in user's RLS-scoped client. */
export async function countSetupRows(
  db: SupabaseClient<Database>,
  table: SetupCountTable,
  filter?: { column: 'active'; value: boolean } | { column: 'status'; value: 'Released' },
): Promise<number> {
  let query = db.from(table).select('id', { count: 'exact', head: true });
  if (filter) query = query.filter(filter.column, 'eq', filter.value);
  const { count, error } = await query;
  if (error || count === null) {
    const cause = error ?? new Error('Setup count was unavailable.');
    reportApplicationError({
      cause,
      message: 'Setup progress could not be loaded.',
      operation: `setup_count.${table}`,
    }).catch(() => undefined);
    throw operationError('setup_count', 'Unable to load setup progress.', cause);
  }
  return count;
}
