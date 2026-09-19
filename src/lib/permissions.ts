import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';
import { operationError } from './operation-error';

/** A failed permission lookup is an operational error, never an implicit grant/denial. */
export default async function hasPermission(db: SupabaseClient<Database>, requested: string) {
  z.string().min(1).max(100).parse(requested);
  const result = await db.rpc('has_permission', { requested });
  if (result.error) {
    throw operationError(
      'permission_lookup',
      'Unable to verify permissions. Try again.',
      result.error,
    );
  }
  return z.boolean().parse(result.data);
}
