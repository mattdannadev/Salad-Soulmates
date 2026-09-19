'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { supabase, supabaseAdmin } from '@/lib/supabase';
import {
  ingredientSchema,
  supplierSchema,
  packSchema,
  inventorySchema,
  feedbackSchema,
  receiptSchema,
  type ActionResult,
} from '@/domain/master-data';

export async function signIn(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const credentials = z
    .object({ identifier: z.string().trim().min(5).max(254), password: z.string().min(1).max(200) })
    .safeParse(Object.fromEntries(form));
  if (!credentials.success)
    return {
      ok: false,
      message: 'Enter your email or phone number and password.',
    };
  const db = await supabase();
  const identifier = credentials.data.identifier;
  const login = identifier.includes('@')
    ? { email: identifier, password: credentials.data.password }
    : { phone: identifier, password: credentials.data.password };
  const { error } = await db.auth.signInWithPassword(login);
  if (error) return { ok: false, message: 'Unable to sign in. Check your details and try again.' };
  redirect('/app');
}

export async function requestAccess(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (String(form.get('website') ?? '')) return { ok: true, message: 'Request received.' };
  const parsed = z
    .object({
      display_name: z.string().trim().min(2).max(120),
      contact: z.string().trim().min(5).max(254),
      preferred_locale: z.enum(['en', 'es']),
      requested_role: z.enum(['reviewer', 'worker', 'receiver']),
    })
    .safeParse(Object.fromEntries(form));
  if (!parsed.success)
    return { ok: false, message: 'Enter your name and a valid email or phone number.' };
  const isEmail = z.email().safeParse(parsed.data.contact).success;
  const phone = parsed.data.contact.replace(/[\s().-]/g, '');
  const isPhone = /^\+[1-9]\d{7,14}$/.test(phone);
  if (!isEmail && !isPhone)
    return {
      ok: false,
      message: 'Use a valid email or a phone number with country code, such as +13125551234.',
    };
  const db = await supabase();
  const { error } = await db.from('access_requests').insert({
    display_name: parsed.data.display_name,
    contact_kind: isEmail ? 'email' : 'phone',
    contact_value: isEmail ? parsed.data.contact.toLowerCase() : phone,
    preferred_locale: parsed.data.preferred_locale,
    requested_role: parsed.data.requested_role,
  });
  if (error?.code === '23505')
    return { ok: true, message: 'A request for this email or phone number is already pending.' };
  if (error) return { ok: false, message: 'We could not submit your request. Please try again.' };
  return {
    ok: true,
    message: 'Request submitted. An administrator will contact you after reviewing access.',
  };
}

export async function setPreferredLocale(form: FormData) {
  const parsed = z.enum(['en', 'es']).safeParse(form.get('locale'));
  if (!parsed.success) return;
  const { db, profile } = await requireProfile();
  const { error } = await db
    .from('profiles')
    .update({ preferred_locale: parsed.data })
    .eq('id', profile.id);
  if (error) throw new Error('Unable to update language.');
  revalidatePath('/', 'layout');
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
  const { db, profile } = await requireProfile();
  const { data: allowed } = await db.rpc('has_permission', { requested: 'access.manage' });
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
    .in('status', ['New', 'Contacted']);
  if (error) return { ok: false, message: 'Could not update this request.' };
  revalidatePath('/app/access-requests');
  return { ok: true, message: 'Request updated.' };
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
  const { db, profile } = await requireProfile();
  const { data: allowed } = await db.rpc('has_permission', { requested: 'access.manage' });
  if (!allowed) return { ok: false, message: 'Access management permission required.' };
  const { data: request, error: loadError } = await db
    .from('access_requests')
    .select('*')
    .eq('id', parsed.data.id)
    .single();
  if (loadError || !request || request.contact_kind !== 'email')
    return {
      ok: false,
      message: 'Email is required for an invitation. Mark phone requests as contacted.',
    };
  let invitedUserId = request.auth_user_id as string | null;
  if (!invitedUserId) {
    let admin;
    try {
      admin = supabaseAdmin();
    } catch {
      return {
        ok: false,
        message: 'Invitations need the Supabase secret configured on the server.',
      };
    }
    const host = process.env.VERCEL_PROJECT_PRODUCTION_URL;
    const { data, error } = await admin.auth.admin.inviteUserByEmail(request.contact_value, {
      data: { display_name: request.display_name },
      redirectTo: `${host ? `https://${host}` : 'http://localhost:3000'}/auth/callback?next=/reset-password`,
    });
    if (error || !data.user)
      return {
        ok: false,
        message: 'The invitation could not be sent. The email may already have an account.',
      };
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
      .eq('id', parsed.data.id);
    if (invited.error)
      return {
        ok: false,
        message: 'Invitation sent, but the request still needs administrator completion.',
      };
  }
  const { error } = await db.rpc('approve_access_request', {
    request_id: parsed.data.id,
    invited_user_id: invitedUserId,
    assigned_facility_id: parsed.data.facility_id,
    assigned_access_profile_id: parsed.data.access_profile_id,
  });
  if (error)
    return {
      ok: false,
      message: 'Invitation exists, but access could not be assigned. Try approval again.',
    };
  revalidatePath('/app/access-requests');
  return { ok: true, message: 'Approved. The invitation was sent and access was assigned.' };
}

export async function requestPasswordReset(
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  const parsed = z.object({ email: z.email() }).safeParse(Object.fromEntries(form));
  if (!parsed.success) return { ok: false, message: 'Enter a valid email address.' };
  const db = await supabase();
  const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
  const siteUrl = productionHost ? `https://${productionHost}` : 'http://localhost:3000';
  const { error } = await db.auth.resetPasswordForEmail(parsed.data.email, {
    redirectTo: `${siteUrl}/auth/callback?next=/reset-password`,
  });
  if (error) console.error('password_reset_request_failed', { code: error.code });
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
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
  const db = await supabase();
  const { data } = await db.auth.getUser();
  if (!data.user)
    return { ok: false, message: 'This reset link is no longer valid. Request a new one.' };
  const { error } = await db.auth.updateUser({ password: parsed.data.password });
  if (error)
    return { ok: false, message: 'Could not update the password. Request a new reset link.' };
  await db.auth.signOut();
  redirect('/login?reset=success');
}
export async function signOut() {
  const db = await supabase();
  await db.auth.signOut();
  redirect('/login');
}

export async function saveRecord(kind: string, input: unknown): Promise<ActionResult> {
  const { db } = await requireProfile();
  const permissionByKind: Record<string, string> = {
    ingredient: 'master_data.write',
    supplier: 'master_data.write',
    pack: 'master_data.write',
    allergen: 'master_data.write',
    inventory: 'inventory.adjust',
    receipt: 'inventory.receive',
    'feedback-status': 'feedback.manage',
    'reference-option': 'settings.manage',
    'access-profile': 'settings.manage',
  };
  const requestedPermission = permissionByKind[kind];
  if (requestedPermission) {
    const { data: allowed } = await db.rpc('has_permission', { requested: requestedPermission });
    if (!allowed) return { ok: false, message: 'Your access profile does not allow this action.' };
  }
  let error: { message: string; code?: string } | null = null;
  let id: string | undefined;
  if (kind === 'ingredient') {
    const parsed = ingredientSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const result = await db.rpc('save_ingredient', { payload: parsed.data });
    error = result.error;
    id = result.data;
  } else if (kind === 'supplier' || kind === 'pack') {
    const parsed = (kind === 'supplier' ? supplierSchema : packSchema).safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const { id: recordId, ...values } = parsed.data;
    const table = kind === 'supplier' ? 'suppliers' : 'supplier_items';
    const record: Record<string, string | number | boolean> = values;
    const result = recordId
      ? await db.from(table).update(record).eq('id', recordId).select('id').single()
      : await db.from(table).insert(record).select('id').single();
    error = result.error;
    id = result.data?.id;
  } else if (kind === 'allergen') {
    const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(input);
    if (!parsed.success)
      return { ok: false, message: 'Enter an allergen name (up to 80 characters).' };
    const result = await db.from('allergens').insert(parsed.data);
    error = result.error;
  } else if (kind === 'inventory') {
    const parsed = inventorySchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const result = await db.from('inventory_events').insert(parsed.data).select('id').single();
    if (result.error?.code === '23505') {
      const existing = await db
        .from('inventory_events')
        .select('*')
        .eq('request_id', parsed.data.request_id)
        .maybeSingle();
      const entry = existing.data;
      if (
        entry &&
        entry.ingredient_id === parsed.data.ingredient_id &&
        entry.event_type === parsed.data.event_type &&
        Number(entry.quantity_delta) === parsed.data.quantity_delta &&
        entry.uom === parsed.data.uom &&
        entry.reason_note === parsed.data.reason_note
      ) {
        revalidatePath('/app', 'layout');
        return { ok: true, message: 'This inventory entry was already saved.' };
      }
      return {
        ok: false,
        message:
          'This entry was already used with different values. Reload before adding a new entry.',
      };
    }
    error = result.error;
    id = result.data?.id;
  } else if (kind === 'receipt') {
    const parsed = receiptSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const result = await db.rpc('post_inventory_receipt', { payload: parsed.data });
    error = result.error;
    id = result.data;
  } else if (kind === 'reference-option') {
    const parsed = z
      .object({
        id: z.uuid().optional(),
        list_code: z.string().min(1).max(80),
        code: z.string().regex(/^[a-zA-Z][a-zA-Z0-9_]{0,49}$/),
        label_en: z.string().trim().min(1).max(100),
        label_es: z.string().trim().min(1).max(100),
        sort_order: z.number().int().min(0).max(10000),
        active: z.boolean(),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const { id: optionId, ...values } = parsed.data;
    const result = optionId
      ? await db.from('reference_options').update(values).eq('id', optionId).select('id').single()
      : await db.from('reference_options').insert(values).select('id').single();
    error = result.error;
    id = result.data?.id;
  } else if (kind === 'access-profile') {
    const parsed = z
      .object({
        id: z.uuid().optional(),
        name: z.string().trim().min(2).max(100),
        description: z.string().trim().max(500),
        base_role: z.enum(['admin', 'reviewer', 'worker', 'receiver']),
        active: z.boolean(),
        permission_codes: z.array(z.string().min(1)).max(100),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const result = await db.rpc('save_access_profile', { payload: parsed.data });
    error = result.error;
    id = result.data;
  } else if (kind === 'feedback') {
    const parsed = feedbackSchema.safeParse(input);
    if (!parsed.success) return { ok: false, message: parsed.error.issues[0].message };
    const match = parsed.data.route.match(/^\/app\/ingredients\/([0-9a-f-]{36})$/);
    const result = await db.from('feedback_items').insert({
      ...parsed.data,
      entity_type: match ? 'ingredient' : null,
      entity_id: match?.[1] ?? null,
      app_version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    });
    error = result.error;
  } else if (kind === 'feedback-status') {
    const parsed = z
      .object({
        id: z.uuid(),
        status: z.enum(['New', 'Reviewed', 'Resolved']),
        resolution_note: z.string().max(2000),
      })
      .safeParse(input);
    if (!parsed.success) return { ok: false, message: 'Invalid review.' };
    const { id: feedbackId, ...values } = parsed.data;
    const result = await db
      .from('feedback_items')
      .update(values)
      .eq('id', feedbackId)
      .select('id')
      .single();
    error = result.error;
  } else return { ok: false, message: 'Unknown action.' };
  if (error) {
    // SQL errors have useful validation text, but avoid disclosing identifiers or query details.
    const messages: Record<string, string> = {
      '23505': 'A matching record or preferred pack already exists.',
      '23503': 'Choose records belonging to this organization.',
      '42501': 'You do not have permission to save this record.',
    };
    const safe = error.message.includes('Base unit cannot change')
      ? 'Base unit cannot change after inventory history exists.'
      : error.message.includes('Inventory unit must match')
        ? 'Inventory unit must match the ingredient base unit.'
        : (messages[error.code ?? ''] ?? 'Could not save. Check the fields and try again.');
    console.error('save_failed', { kind, code: error.code });
    return { ok: false, message: safe };
  }
  revalidatePath('/app', 'layout');
  return {
    ok: true,
    message:
      kind === 'feedback'
        ? 'Thank you. Your feedback was saved. / Gracias. Comentario guardado.'
        : kind === 'receipt'
          ? 'Receipt posted and inventory updated.'
          : 'Saved successfully.',
    id,
  };
}
