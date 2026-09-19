import 'server-only';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { profileRowSchema } from '@/domain/master-data';
import { operationError } from './operation-error';
import { supabase, isConfigured } from './supabase';

export async function requireProfile({ readOnly = true } = {}) {
  if (!isConfigured()) redirect('/setup');
  const db = await supabase({ readOnly });
  const {
    data: { user },
    error: authError,
  } = await db.auth.getUser();
  if (authError && !isAuthSessionMissingError(authError)) throw operationError('profile_auth', 'Unable to verify the session. Try again.', authError);
  if (!user) redirect('/login');
  const { data, error } = await db
    .from('profiles')
    .select('*')
    .eq('id', user.id)
    .eq('active', true)
    .maybeSingle();
  if (error) throw operationError('profile_load', 'Unable to load your access profile.', error);
  if (!data) redirect('/access');
  return { db, profile: profileRowSchema.parse(data) };
}
export async function requireAdminShell() {
  const ctx = await requireProfile();
  if (ctx.profile.role === 'worker') redirect('/worker');
  if (ctx.profile.role === 'receiver') redirect('/receiving');
  return ctx;
}
