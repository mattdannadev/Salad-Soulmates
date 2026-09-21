'use server';

import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { supabase, supabaseAdmin, SupabaseConfigurationError } from '@/lib/supabase';
import { accessRequestRowSchema, type ActionResult } from '@/domain/master-data';
import { recordKindSchema } from '@/domain/record-schemas';
import { recordOperations, recordPermissions } from '@/lib/save-record';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';
import confirmSignOut from '@/lib/sign-out';
import authCallbackUrl from '@/domain/auth-callback-url';

export async function signIn(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const credentials = z
    .object({ identifier: z.string().trim().min(5).max(254), password: z.string().min(1).max(200) })
    .safeParse(Object.fromEntries(form));
  if (!credentials.success) {
    return {
      ok: false,
      message: 'Enter your email or phone number and password.',
    };
  }
  const db = await supabase({ readOnly: false });
  const { identifier } = credentials.data;
  const login = identifier.includes('@')
    ? { email: identifier, password: credentials.data.password }
    : { phone: identifier, password: credentials.data.password };
  const { error } = await db.auth.signInWithPassword(login);
  if (error) return { ok: false, message: 'Unable to sign in. Check your details and try again.' };
  return redirect('/app');
}

export async function requestAccess(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (form.get('website')) return { ok: true, message: 'Request received.' };
  const parsed = z
    .object({
      display_name: z.string().trim().min(2).max(120),
      contact: z.string().trim().min(5).max(254),
      preferred_locale: z.enum(['en', 'es']),
      requested_role: z.enum(['reviewer', 'worker', 'receiver']),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'Enter your name and a valid email or phone number.' };
  const isEmail = z.email().safeParse(parsed.data.contact).success;
  const phone = parsed.data.contact.replace(/[\s().-]/g, '');
  const isPhone = /^\+[1-9]\d{7,14}$/.test(phone);
  if (!isEmail && !isPhone) {
    return {
      ok: false,
      message: 'Use a valid email or a phone number with country code, such as +13125551234.',
    };
  }
  const db = await supabase({ readOnly: false });
  const { error } = await db.from('access_requests').insert({
    display_name: parsed.data.display_name,
    contact_kind: isEmail ? 'email' : 'phone',
    contact_value: isEmail ? parsed.data.contact.toLowerCase() : phone,
    preferred_locale: parsed.data.preferred_locale,
    requested_role: parsed.data.requested_role,
  });
  if (error?.code === '23505') return { ok: true, message: 'A request for this email or phone number is already pending.' };
  if (error) return { ok: false, message: 'We could not submit your request. Please try again.' };
  return {
    ok: true,
    message: 'Request submitted. An administrator will contact you after reviewing access.',
  };
}

export async function setPreferredLocale(form: FormData): Promise<ActionResult> {
  const parsed = z.enum(['en', 'es']).safeParse(form.get('locale'));
  if (!parsed.success) return { ok: false, message: 'Choose English or Spanish.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  const failure = {
    ok: false,
    message: profile.preferred_locale === 'es'
      ? 'No se pudo guardar el idioma. Vuelve a intentarlo.'
      : 'Could not save the language. Please try again.',
  };
  try {
    const { data, error } = await db
      .from('profiles')
      .update({ preferred_locale: parsed.data })
      .eq('id', profile.id)
      .select('id,preferred_locale')
      .single();
    if (error) {
      logFailure('locale_update', error);
      return failure;
    }
    const saved = z.object({ id: z.uuid(), preferred_locale: z.enum(['en', 'es']) }).safeParse(data);
    if (
      !saved.success || saved.data.id !== profile.id
      || saved.data.preferred_locale !== parsed.data
    ) {
      logFailure('locale_update', { code: 'INVALID_RESPONSE' });
      return failure;
    }
  } catch (error) {
    logFailure('locale_update', error);
    return failure;
  }
  revalidatePath('/', 'layout');
  return { ok: true, message: parsed.data === 'es' ? 'Idioma actualizado.' : 'Language updated.' };
}

export async function reviewAccessRequest(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.uuid(),
      decision: z.enum(['Contacted', 'Declined']),
      note: z.string().trim().max(1000),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'Invalid review.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  const allowed = await hasPermission(db, 'access.manage');
  if (!allowed) return { ok: false, message: 'Access management permission required.' };
  const { error } = await db
    .from('access_requests')
    .update({
      status: parsed.data.decision,
      review_note: parsed.data.note,
      reviewed_at: new Date().toISOString(),
      reviewed_by: profile.id,
    })
    .eq('id', parsed.data.id)
    .in('status', ['New', 'Contacted'])
    .select('id')
    .single();
  if (error) return { ok: false, message: 'Could not update this request.' };
  revalidatePath('/app/access-requests');
  return { ok: true, message: 'Request updated.' };
}

interface InvitationAssignment {
  db: Awaited<ReturnType<typeof supabase>>;
  profile: { id: string };
  request: ReturnType<typeof accessRequestRowSchema.parse>;
  facilityId: string;
  accessProfileId: string;
}

/**
 * Sends the Auth invitation only after there is a recoverable access-request record,
 * then uses the database function to assign the approved facility and profile.
 */
async function sendInvitationAndAssignAccess({
  db,
  profile,
  request,
  facilityId,
  accessProfileId,
}: InvitationAssignment): Promise<ActionResult> {
  if (request.contact_kind !== 'email') {
    return {
      ok: false,
      message: 'Email is required for an invitation. Mark phone requests as contacted.',
    };
  }
  let invitedUserId = request.auth_user_id;
  if (!invitedUserId) {
    let admin;
    try {
      admin = supabaseAdmin();
    } catch (cause) {
      if (!(cause instanceof SupabaseConfigurationError)) throw cause;
      logFailure('invitation_configuration', { code: 'NOT_CONFIGURED' });
      return {
        ok: false,
        message: 'Invitations need the Supabase secret configured on the server.',
      };
    }
    const { data, error } = await admin.auth.admin.inviteUserByEmail(request.contact_value, {
      data: { display_name: request.display_name },
      redirectTo: authCallbackUrl(process.env),
    });
    if (error || !data.user) {
      return {
        ok: false,
        message: 'The invitation could not be sent. The email may already have an account.',
      };
    }
    invitedUserId = data.user.id;
    const invited = await db
      .from('access_requests')
      .update({
        status: 'Invited',
        auth_user_id: invitedUserId,
        reviewed_at: new Date().toISOString(),
        reviewed_by: profile.id,
        review_note: 'Invitation sent',
      })
      .eq('id', request.id)
      .select('id')
      .single();
    if (invited.error) {
      return {
        ok: false,
        message: 'Invitation sent, but its account could not be saved. An administrator must reconcile the existing invitation before retrying.',
      };
    }
  }
  const { error } = await db.rpc('approve_access_request', {
    request_id: request.id,
    invited_user_id: invitedUserId,
    assigned_facility_id: facilityId,
    assigned_access_profile_id: accessProfileId,
  });
  if (error) {
    return {
      ok: false,
      message: 'Invitation exists, but access could not be assigned. Try approval again.',
    };
  }
  return { ok: true, message: 'Approved. The invitation was sent and access was assigned.' };
}

export async function approveAccessRequest(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      id: z.uuid(),
      facility_id: z.uuid(),
      access_profile_id: z.uuid(),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'Choose a facility and access profile.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  const allowed = await hasPermission(db, 'access.manage');
  if (!allowed) return { ok: false, message: 'Access management permission required.' };
  const { data: requestData, error: loadError } = await db
    .from('access_requests')
    .select('*')
    .eq('id', parsed.data.id)
    .single();
  if (loadError) {
    logFailure('access_request_load', loadError);
    return { ok: false, message: 'Could not load this request. Reload before trying again.' };
  }
  const request = accessRequestRowSchema.parse(requestData);
  const result = await sendInvitationAndAssignAccess({
    db,
    profile,
    request,
    facilityId: parsed.data.facility_id,
    accessProfileId: parsed.data.access_profile_id,
  });
  if (result.ok) revalidatePath('/app/access-requests');
  return result;
}

export async function inviteUserFromSettings(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z.object({
    display_name: z.string().trim().min(2).max(120),
    email: z.email(),
    preferred_locale: z.enum(['en', 'es']),
    facility_id: z.uuid(),
    access_profile_id: z.uuid(),
  }).safeParse(Object.fromEntries(form));
  if (!parsed.success) {
    return { ok: false, message: 'Enter a name, work email, facility, access profile, and language.' };
  }
  const { db, profile } = await requireProfile({ readOnly: false });
  if (!(await hasPermission(db, 'access.manage'))) {
    return { ok: false, message: 'Access management permission required.' };
  }
  const { data, error } = await db
    .from('access_requests')
    .insert({
      display_name: parsed.data.display_name,
      contact_kind: 'email',
      contact_value: parsed.data.email.toLowerCase(),
      preferred_locale: parsed.data.preferred_locale,
      requested_role: 'reviewer',
    })
    .select('*')
    .single();
  if (error?.code === '23505') {
    return { ok: false, message: 'This email already has a pending invitation or access request.' };
  }
  if (error || !data) {
    logFailure('direct_invitation_request_create', error ?? { code: 'EMPTY_RESPONSE' });
    return { ok: false, message: 'Could not prepare this invitation. Please try again.' };
  }
  const request = accessRequestRowSchema.safeParse(data);
  if (!request.success) {
    logFailure('direct_invitation_request_create', { code: 'INVALID_RESPONSE' });
    return { ok: false, message: 'Could not prepare this invitation. Please try again.' };
  }
  const result = await sendInvitationAndAssignAccess({
    db,
    profile,
    request: request.data,
    facilityId: parsed.data.facility_id,
    accessProfileId: parsed.data.access_profile_id,
  });
  if (result.ok) {
    revalidatePath('/app/settings');
    revalidatePath('/app/access-requests');
  }
  return result;
}

export async function requestPasswordReset(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z.object({ email: z.email() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'Enter a valid email address.' };
  const db = await supabase({ readOnly: false });
  const { error } = await db.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: authCallbackUrl(process.env),
  });
  if (error) {
    logFailure('password_reset_request_failed', error);
    return { ok: false, message: 'Unable to request a password reset right now. Please try again.' };
  }
  return {
    ok: true,
    message: 'If that email belongs to an account, a password-reset link is on its way.',
  };
}

export async function updatePassword(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z
    .object({
      password: z.string().min(12).max(200),
      confirm_password: z.string().min(12).max(200),
    })
    .refine((value) => value.password === value.confirm_password, 'Passwords must match.')
    .safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Invalid input.' };
  const db = await supabase({ readOnly: false });
  const { data, error: sessionError } = await db.auth.getUser();
  if (sessionError) {
    logFailure('password_session_verification', sessionError);
    return {
      ok: false,
      message: 'Could not verify this session. Request a new reset link or try again.',
    };
  }
  if (!data.user) return { ok: false, message: 'This reset link is no longer valid. Request a new one.' };
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error) return { ok: false, message: 'Could not update the password. Request a new reset link.' };
  try {
    await confirmSignOut(db);
  } catch (cause) {
    logFailure('password_reset_sign_out', cause);
    return {
      ok: false,
      message: 'Your password changed, but sign-out failed. Please sign out again.',
    };
  }
  return redirect('/login?reset=success');
}
export async function signOut() {
  const db = await supabase({ readOnly: false });
  await confirmSignOut(db);
  redirect('/login');
}

/** Public server-action contract; authorization precedes each focused operation. */
export async function saveRecord(kind: string, input: unknown): Promise<ActionResult> {
  const parsed = recordKindSchema.safeParse(kind);
  if (!parsed.success) return { ok: false, message: 'Unknown action.' };
  const { db } = await requireProfile({ readOnly: false });
  const permission = recordPermissions[parsed.data];
  if (permission && !(await hasPermission(db, permission))) {
    return { ok: false, message: 'Your access profile does not allow this action.' };
  }
  const result = await recordOperations[parsed.data](db, input);
  if (result.ok) revalidatePath('/app', 'layout');
  return result;
}
