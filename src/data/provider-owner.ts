import 'server-only';
import { operationError } from '@/lib/operation-error';
import { supabaseAdmin } from '@/lib/supabase';

/** Provider ownership is read from the current assignment, never JWT metadata. */
export default async function isProviderOwner(userId: string): Promise<boolean> {
  const { data, error } = await supabaseAdmin()
    .from('provider_role_assignments')
    .select('id')
    .eq('user_id', userId)
    .eq('role_code', 'provider_owner')
    .limit(1);
  if (error) {
    throw operationError('provider_owner_check', 'Unable to verify provider ownership.', error);
  }
  return Array.isArray(data) && data.length === 1;
}
