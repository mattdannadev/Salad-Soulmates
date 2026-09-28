import 'server-only';
import { isAuthSessionMissingError } from '@supabase/supabase-js';
import { redirect } from 'next/navigation';
import { profileRowSchema } from '@/domain/master-data';
import abortable from './abortable';
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

type ApiAdminShellResult = Awaited<ReturnType<typeof requireProfile>> & { ok: true }
  | { ok: false; status: 401 | 403 | 503; error: string };

/** Resolves an administrative API caller without using page redirect control flow. */
export async function resolveApiAdminShell(signal?: AbortSignal): Promise<ApiAdminShellResult> {
  signal?.throwIfAborted();
  if (!isConfigured()) {
    return {
      ok: false,
      status: 503,
      error: 'Administration diagnostics are temporarily unavailable.',
    };
  }
  const db = await abortable(supabase({ readOnly: true, signal }), signal);
  const {
    data: { user },
    error: authError,
  } = await abortable(db.auth.getUser(), signal);
  if (authError && !isAuthSessionMissingError(authError)) {
    throw operationError('api_profile_auth', 'Unable to verify the session. Try again.', authError);
  }
  if (!user) {
    return { ok: false, status: 401, error: 'Sign in to use administration diagnostics.' };
  }
  let query = db
    .from('profiles')
    .select('*')
    .eq('id', user.id);
  if (signal) query = query.abortSignal(signal);
  const { data, error } = await abortable(query.maybeSingle(), signal);
  if (error) throw operationError('api_profile_load', 'Unable to load your access profile.', error);
  if (!data) {
    return {
      ok: false,
      status: 403,
      error: 'An active administrative access profile is required.',
    };
  }
  const profile = profileRowSchema.parse(data);
  if (!profile.active || profile.role === 'worker' || profile.role === 'receiver') {
    return {
      ok: false,
      status: 403,
      error: 'An active administrative access profile is required.',
    };
  }
  return { ok: true, db, profile };
}
