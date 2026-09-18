'use server';
import { revalidatePath } from 'next/cache';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import { supabase } from '@/lib/supabase';
import {
  ingredientSchema,
  supplierSchema,
  packSchema,
  inventorySchema,
  feedbackSchema,
  type ActionResult,
} from '@/domain/master-data';

export async function signIn(_previous: ActionResult, form: FormData): Promise<ActionResult> {
  const credentials = z
    .object({ email: z.email(), password: z.string().min(1).max(200) })
    .safeParse(Object.fromEntries(form));
  if (!credentials.success)
    return {
      ok: false,
      message: 'Enter your email and password. / Ingresa tu correo y contraseña.',
    };
  const db = await supabase();
  const { error } = await db.auth.signInWithPassword(credentials.data);
  if (error)
    return { ok: false, message: 'Unable to sign in. Check your details. / Revisa tus datos.' };
  redirect('/app');
}
export async function signOut() {
  const db = await supabase();
  await db.auth.signOut();
  redirect('/login');
}

export async function saveRecord(kind: string, input: unknown): Promise<ActionResult> {
  const { db, profile } = await requireProfile();
  if (kind !== 'feedback' && profile.role !== 'admin')
    return { ok: false, message: 'Administrator access required.' };
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
        : 'Saved successfully.',
    id,
  };
}
