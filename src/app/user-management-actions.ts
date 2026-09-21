'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import authCallbackUrl from '@/domain/auth-callback-url';
import { requireProfile } from '@/lib/auth';
import { logFailure } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';
import { supabaseAdmin, SupabaseConfigurationError } from '@/lib/supabase';

export interface UserManagementActionResult {
  ok: boolean;
  message: string;
  resetLink?: string;
}

const userTargetSchema = z.object({ user_id: z.uuid() });
const deactivationSchema = userTargetSchema.extend({
  reason: z.string().trim().min(3).max(500),
});
const trustedTargetSchema = z.object({
  id: z.uuid(),
  active: z.boolean(),
});
const accessProfileChangeSchema = userTargetSchema.extend({
  access_profile_id: z.uuid(),
});
const resetLinkSchema = z.url();

async function requireAccessManager(targetUserId: string) {
  const { db, profile } = await requireProfile({ readOnly: false });
  if (!(await hasPermission(db, 'access.manage'))) {
    return { ok: false, error: 'Access management permission required.' } as const;
  }
  let targetResult;
  try {
    targetResult = await db
      .from('profiles')
      .select('id,active')
      .eq('organization_id', profile.organization_id)
      .eq('id', targetUserId)
      .maybeSingle();
  } catch (cause) {
    logFailure('user_management_target_load', cause);
    return { ok: false, error: 'Could not verify this user. Reload and try again.' } as const;
  }
  if (targetResult.error) {
    logFailure('user_management_target_load', targetResult.error);
    return { ok: false, error: 'Could not verify this user. Reload and try again.' } as const;
  }
  const target = trustedTargetSchema.safeParse(targetResult.data);
  if (!target.success) {
    return { ok: false, error: 'This user is not available in your organization.' } as const;
  }
  return {
    ok: true, db, profile, target: target.data,
  } as const;
}

function configuredAdmin() {
  try {
    return { ok: true, admin: supabaseAdmin() } as const;
  } catch (cause) {
    if (!(cause instanceof SupabaseConfigurationError)) throw cause;
    logFailure('user_management_auth_configuration', { code: 'NOT_CONFIGURED' });
    return {
      ok: false,
      error: 'User security actions need the Supabase secret configured on the server.',
    } as const;
  }
}

/** Generate a one-time recovery link only after resolving the target email server-side. */
export async function generateUserPasswordResetLink(
  _previous: UserManagementActionResult,
  form: FormData,
): Promise<UserManagementActionResult> {
  const input = userTargetSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { ok: false, message: 'Invalid user selection.' };
  const access = await requireAccessManager(input.data.user_id);
  if (!access.ok) return { ok: false, message: access.error };
  if (!access.target.active) {
    return { ok: false, message: 'Password reset is unavailable while this user is inactive.' };
  }
  const configured = configuredAdmin();
  if (!configured.ok) return { ok: false, message: configured.error };
  try {
    const authUserResult = await configured.admin.auth.admin.getUserById(access.target.id);
    if (authUserResult.error) {
      logFailure('user_management_auth_user_load', authUserResult.error);
      return { ok: false, message: 'Could not load this user’s authentication account.' };
    }
    const trustedEmail = z.email().safeParse(authUserResult.data.user?.email);
    if (!trustedEmail.success) {
      return { ok: false, message: 'This user does not have a valid authentication email.' };
    }
    const generated = await configured.admin.auth.admin.generateLink({
      type: 'recovery',
      email: trustedEmail.data,
      options: { redirectTo: authCallbackUrl(process.env) },
    });
    if (generated.error) {
      logFailure('user_management_password_reset_link', generated.error);
      return { ok: false, message: 'Could not create a password-reset link. Try again.' };
    }
    const resetLink = resetLinkSchema.safeParse(generated.data.properties.action_link);
    if (!resetLink.success || generated.data.user.id !== access.target.id) {
      logFailure('user_management_password_reset_link', { code: 'INVALID_AUTH_RESPONSE' });
      return { ok: false, message: 'Supabase returned an invalid password-reset response.' };
    }
    let auditResult;
    try {
      auditResult = await configured.admin.from('audit_events').insert({
        organization_id: access.profile.organization_id,
        actor_user_id: access.profile.id,
        entity_type: 'profiles',
        entity_id: access.target.id,
        event_type: 'USER_PASSWORD_RESET_LINK_GENERATED',
        after_data: { target_user_id: access.target.id },
      });
    } catch (cause) {
      logFailure('user_management_password_reset_audit', cause);
      return {
        ok: false,
        message: 'A reset link was created, but its audit record could not be saved. Do not share it; try again after the audit service recovers.',
      };
    }
    if (auditResult.error) {
      logFailure('user_management_password_reset_audit', auditResult.error);
      return {
        ok: false,
        message: 'A reset link was created, but its audit record could not be saved. Do not share it; try again after the audit service recovers.',
      };
    }
    return {
      ok: true,
      message: 'Password-reset link created. Share it only with the selected user.',
      resetLink: resetLink.data,
    };
  } catch (cause) {
    logFailure('user_management_password_reset_link', cause);
    return { ok: false, message: 'Could not create a password-reset link. Try again.' };
  }
}

const safeDeactivationMessages = new Set([
  'You cannot deactivate your own access',
  'The last active access manager cannot be deactivated',
  'User access is already inactive',
  'User must belong to your organization',
  'A deactivation reason between 3 and 500 characters is required',
]);

const safeAccessProfileMessages = new Set([
  'Access management permission required',
  'User must belong to your organization',
  'Invalid access profile',
  'The last active access manager cannot be reassigned',
]);

/** Change a user's assigned access profile through the audited database function. */
export async function changeManagedUserAccessProfile(
  _previous: UserManagementActionResult,
  form: FormData,
): Promise<UserManagementActionResult> {
  const input = accessProfileChangeSchema.safeParse(Object.fromEntries(form));
  if (!input.success) return { ok: false, message: 'Choose a valid access profile.' };
  const access = await requireAccessManager(input.data.user_id);
  if (!access.ok) return { ok: false, message: access.error };
  let result;
  try {
    result = await access.db.rpc('change_user_access_profile', {
      target_user_id: access.target.id,
      assigned_access_profile_id: input.data.access_profile_id,
    });
  } catch (cause) {
    logFailure('user_management_access_profile_change', cause);
    return { ok: false, message: 'Could not change this access profile. Reload and try again.' };
  }
  if (result.error) {
    logFailure('user_management_access_profile_change', result.error);
    return {
      ok: false,
      message: safeAccessProfileMessages.has(result.error.message)
        ? `${result.error.message}.`
        : 'Could not change this access profile. Reload and try again.',
    };
  }
  revalidatePath('/app/user-management/users');
  revalidatePath(`/app/user-management/users/${access.target.id}`);
  return { ok: true, message: 'Access profile updated.' };
}

/** Deactivate app access through the audited database function; never delete Auth identities. */
export async function deactivateManagedUser(
  _previous: UserManagementActionResult,
  form: FormData,
): Promise<UserManagementActionResult> {
  const input = deactivationSchema.safeParse(Object.fromEntries(form));
  if (!input.success) {
    return { ok: false, message: 'Enter a deactivation reason between 3 and 500 characters.' };
  }
  const access = await requireAccessManager(input.data.user_id);
  if (!access.ok) return { ok: false, message: access.error };
  if (access.profile.id === access.target.id) {
    return { ok: false, message: 'You cannot deactivate your own access.' };
  }
  let result;
  try {
    result = await access.db.rpc('deactivate_user_access', {
      target_user_id: access.target.id,
      reason: input.data.reason,
    });
  } catch (cause) {
    logFailure('user_management_deactivate', cause);
    return { ok: false, message: 'Could not deactivate this user. Reload and try again.' };
  }
  if (result.error) {
    logFailure('user_management_deactivate', result.error);
    const safeMessage = safeDeactivationMessages.has(result.error.message)
      ? `${result.error.message}.`
      : 'Could not deactivate this user. Reload and try again.';
    return { ok: false, message: safeMessage };
  }
  revalidatePath('/app/user-management/users');
  revalidatePath(`/app/user-management/users/${access.target.id}`);
  return {
    ok: true,
    message: 'User access deactivated. Their account and historical records were retained.',
  };
}
