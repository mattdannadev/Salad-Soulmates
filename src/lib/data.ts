import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';

// Read every page so inventory totals never silently stop at the API row limit.
export async function rows<T>(db: SupabaseClient, table: string): Promise<T[]> {
  const result: T[] = [];
  for (let offset = 0; ; offset += 500) {
    const { data, error } = await db
      .from(table)
      .select('*')
      .order('id')
      .range(offset, offset + 499);
    if (error) throw new Error(`Unable to load ${table}.`);
    result.push(...(data as T[]));
    if (data.length < 500) return result;
  }
}
export const number = (value: number) =>
  new Intl.NumberFormat('en-US', { maximumFractionDigits: 4 }).format(value);
export const date = (value: string) =>
  new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
    timeZone: 'America/Chicago',
  }).format(new Date(value));
