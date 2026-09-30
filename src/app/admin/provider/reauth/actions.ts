'use server';

import { z } from 'zod';
import {
  ProviderFreshAuthError,
  requireProviderOwnerIdentity,
  requireRecentProviderOwnerAuthentication,
  type ProviderOwnerPasswordIdentity,
} from '@/services/provider-fresh-auth';
import { supabase } from '@/lib/supabase';

export interface ProviderPasswordConfirmationState {
  ok: boolean;
  message: string;
}

export async function confirmProviderOwnerPassword(
  _previous: ProviderPasswordConfirmationState,
  form: FormData,
): Promise<ProviderPasswordConfirmationState> {
  const parsed = z.object({ password: z.string().min(1).max(200) })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'Enter your current password.' };
  let identity: ProviderOwnerPasswordIdentity;
  try {
    identity = await requireProviderOwnerIdentity();
  } catch (error) {
    if (error instanceof ProviderFreshAuthError) return { ok: false, message: error.message };
    throw error;
  }
  const db = await supabase({ readOnly: false });
  const { data, error } = await db.auth.signInWithPassword({
    ...identity.credential,
    password: parsed.data.password,
  });
  if (error || !data.user || data.user.id !== identity.id || !data.session) {
    if (data.session) await db.auth.signOut({ scope: 'local' });
    return { ok: false, message: 'Password confirmation failed. Check your password and try again.' };
  }
  try {
    const persisted = await supabase();
    const sessionResult = await persisted.auth.getSession();
    const { data: persistedSession, error: persistedSessionError } = sessionResult;
    if (persistedSessionError
      || persistedSession.session?.access_token !== data.session.access_token) {
      return { ok: false, message: 'Password confirmation could not be verified. Try again.' };
    }
    const proof = await requireRecentProviderOwnerAuthentication();
    if (proof.actorUserId !== identity.id) {
      await db.auth.signOut({ scope: 'local' });
      return { ok: false, message: 'Password confirmation failed. Sign in and try again.' };
    }
  } catch (cause) {
    if (cause instanceof ProviderFreshAuthError) {
      return { ok: false, message: 'Password confirmation could not be verified. Try again.' };
    }
    throw cause;
  }
  return { ok: true, message: 'Password confirmed for the next 15 minutes.' };
}
