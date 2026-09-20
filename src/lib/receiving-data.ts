import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import { serializedUnitSchema } from '@/domain/receiving';
import type { Database } from './database.types';
import { readResult } from './data';

/** Filter on the server under RLS; never download the entire serialized inventory. */
export default async function loadSerializedUnits(
  db: SupabaseClient<Database>,
  filters: { search_text?: string; receipt_filter?: string; unit_filter?: string } = {},
) {
  const input = z.object({
    search_text: z.string().trim().max(120).optional(),
    receipt_filter: z.uuid().optional(),
    unit_filter: z.uuid().optional(),
  }).parse(filters);
  return readResult(
    await db.rpc('find_serialized_units', input),
    z.array(serializedUnitSchema),
    'serialized_inventory_lookup',
  );
}
