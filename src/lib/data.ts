import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';
import { operationError } from './operation-error';

export { formatNumber as number, formatDate as date } from '@/domain/format';

const PAGE_SIZE = 500;
/** Keep SDK failures distinct from successful but malformed persisted data. */
export function readResult<T>(
  result: { data: unknown; error: unknown },
  schema: z.ZodType<T>,
  operation: string,
): T {
  if (result.error) throw operationError(operation, 'Unable to load the requested records.', result.error);
  return schema.parse(result.data);
}

/** Read all pages under RLS and validate persisted records before returning them to UI code. */
export async function rows<T>(
  db: SupabaseClient<Database>,
  table: keyof Database['public']['Tables'],
  schema: z.ZodType<T>,
): Promise<T[]> {
  const result: T[] = [];
  async function readPage(offset: number): Promise<void> {
    const { data, error } = await db
      .from(table)
      .select('*')
      .order('id')
      .range(offset, offset + PAGE_SIZE - 1);
    if (error) throw operationError('load_rows', `Unable to load ${table}.`, error);
    const page = z.array(schema).parse(data);
    result.push(...page);
    if (page.length === PAGE_SIZE) await readPage(offset + PAGE_SIZE);
  }
  await readPage(0);
  return result;
}
