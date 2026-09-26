import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';
import { operationError } from './operation-error';
import { reportApplicationError } from './error-reporting';

export { formatNumber as number, formatDate as date } from '@/domain/format';

const PAGE_SIZE = 500;
/** Keep SDK failures distinct from successful but malformed persisted data. */
export function readResult<T>(
  result: { data: unknown; error: unknown },
  schema: z.ZodType<T>,
  operation: string,
): T {
  if (result.error) {
    reportApplicationError({
      cause: result.error,
      message: 'Requested records could not be loaded.',
      operation,
    }).catch(() => undefined);
    throw operationError(operation, 'Unable to load the requested records.', result.error);
  }
  const parsed = schema.safeParse(result.data);
  if (!parsed.success) {
    reportApplicationError({
      cause: parsed.error,
      message: 'Stored records did not match the expected format.',
      operation: `${operation}.validation`,
    }).catch(() => undefined);
    throw operationError(operation, 'Stored records need attention before they can be displayed.', parsed.error);
  }
  return parsed.data;
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
    if (error) {
      reportApplicationError({
        cause: error,
        message: `Stored ${String(table)} records could not be loaded.`,
        operation: `load_rows.${String(table)}`,
      }).catch(() => undefined);
      throw operationError('load_rows', `Unable to load ${table}.`, error);
    }
    const parsed = z.array(schema).safeParse(data);
    if (!parsed.success) {
      reportApplicationError({
        cause: parsed.error,
        message: `Stored ${String(table)} records did not match the expected format.`,
        operation: `load_rows.${String(table)}.validation`,
      }).catch(() => undefined);
      throw operationError('load_rows', `Stored ${String(table)} records need attention.`, parsed.error);
    }
    const page = parsed.data;
    result.push(...page);
    if (page.length === PAGE_SIZE) await readPage(offset + PAGE_SIZE);
  }
  await readPage(0);
  return result;
}
