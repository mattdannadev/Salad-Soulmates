import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import type { Database } from './database.types';
import { operationError } from './operation-error';

/** Resolve only after Auth confirms sign-out; a lost response is not confirmation. */
export default async function confirmSignOut(db: SupabaseClient<Database>) {
  let result: unknown;
  try {
    result = await db.auth.signOut();
  } catch (cause) {
    throw operationError('sign_out', 'Unable to sign out. Please try again.', cause);
  }
  const parsed = z.object({ error: z.null() }).safeParse(result);
  if (!parsed.success) {
    const failure = z.object({ error: z.unknown() }).safeParse(result);
    const cause = failure.success ? failure.data.error : parsed.error;
    throw operationError('sign_out', 'Unable to sign out. Please try again.', cause);
  }
}
