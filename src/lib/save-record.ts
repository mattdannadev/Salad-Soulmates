import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import { z } from 'zod';
import {
  ingredientSchema,
  supplierSchema,
  packSchema,
  inventorySchema,
  receiptSchema,
  feedbackSchema,
  type ActionResult,
} from '@/domain/master-data';
import {
  referenceOptionSchema,
  referenceOptionDeleteSchema,
  uomFamilySchema,
  uomSchema,
  uomDeleteSchema,
  accessProfileSchema,
  feedbackStatusSchema,
  invalidInput,
  type RecordKind,
} from '@/domain/record-schemas';
import type { Database } from './database.types';
import { logFailure } from './operation-error';

type Client = SupabaseClient<Database>;
interface WriteResult {
  data?: unknown;
  error: { message: string; code?: string } | null;
}
const SUCCESS_MESSAGES: Partial<Record<RecordKind, string>> = {
  feedback: 'Thank you. Your feedback was saved. / Gracias. Comentario guardado.',
  receipt: 'Receipt posted and inventory updated.',
};
function saved(result: WriteResult, kind: RecordKind, hasId = true): ActionResult {
  if (result.error) {
    const messages: Record<string, string> = {
      23505: 'A matching record or preferred pack already exists.',
      23503: 'Choose records belonging to this organization.',
      42501: 'You do not have permission to save this record.',
    };
    let message = messages[result.error.code ?? '']
      ?? 'Could not save. Check the fields and try again.';
    if (result.error.message.includes('Base unit cannot change')) message = 'Base unit cannot change after inventory history exists.';
    if (result.error.message.includes('Inventory unit must match')) message = 'Inventory unit must match the ingredient base unit.';
    if (result.error.message.includes('Receipt exceeds the outstanding')) message = 'Receipt exceeds the outstanding inbound quantity. Refresh purchasing and check the delivered amount.';
    if (
      result.error.message.includes('Receipt must match inbound')
      || result.error.message.includes('Select confirmed inbound')
    ) message = 'Choose a confirmed order matching this supplier and ingredient.';
    logFailure(`save_${kind}`, result.error);
    return { ok: false, message };
  }
  const parsed = z
    .union([z.uuid(), z.object({ id: z.uuid() }).transform((row) => row.id)])
    .safeParse(result.data);
  if (hasId && !parsed.success) {
    logFailure(`save_${kind}`, { code: 'INVALID_RESPONSE' });
    return {
      ok: false,
      message: 'The save could not be confirmed. Reload before trying again.',
    };
  }
  return {
    ok: true,
    message: SUCCESS_MESSAGES[kind] ?? 'Saved successfully.',
    ...(parsed.success ? { id: parsed.data } : {}),
  };
}
async function saveIngredient(db: Client, input: unknown) {
  const parsed = ingredientSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  return saved(await db.rpc('save_ingredient', { payload: parsed.data }), 'ingredient');
}
async function saveSupplier(db: Client, input: unknown) {
  const parsed = supplierSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { id, ...values } = parsed.data;
  const result = id
    ? await db.from('suppliers').update(values).eq('id', id).select('id')
      .single()
    : await db.from('suppliers').insert(values).select('id').single();
  return saved(result, 'supplier');
}
async function savePack(db: Client, input: unknown) {
  const parsed = packSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { id, ...values } = parsed.data;
  const result = id
    ? await db.from('supplier_items').update(values).eq('id', id).select('id')
      .single()
    : await db.from('supplier_items').insert(values).select('id').single();
  return saved(result, 'pack');
}
async function saveAllergen(db: Client, input: unknown) {
  const parsed = z.object({ name: z.string().trim().min(1).max(80) }).safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Enter an allergen name (up to 80 characters).' };
  return saved(await db.from('allergens').insert(parsed.data), 'allergen', false);
}
async function saveInventory(db: Client, input: unknown): Promise<ActionResult> {
  const parsed = inventorySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const result = await db
    .from('inventory_events')
    .insert(parsed.data)
    .select('id')
    .single();
  if (result.error?.code !== '23505') return saved(result, 'inventory');
  const existing = await db
    .from('inventory_events')
    .select('*')
    .eq('request_id', parsed.data.request_id)
    .maybeSingle();
  if (existing.error) {
    logFailure('inventory_retry_lookup', existing.error);
    return {
      ok: false,
      message:
        'Could not verify the prior entry. Retry these same values with this entry.',
    };
  }
  const entry = inventorySchema.safeParse(existing.data);
  if (
    entry.success
    && Object.entries(parsed.data).every(
      ([key, value]) => Reflect.get(entry.data, key) === value,
    )
  ) {
    return { ok: true, message: 'This inventory entry was already saved.' };
  }
  return {
    ok: false,
    message:
      'This entry was already used with different values. Reload before adding a new entry.',
  };
}
async function saveReceipt(db: Client, input: unknown) {
  const parsed = receiptSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  return saved(
    await db.rpc('post_inventory_receipt', { payload: parsed.data }),
    'receipt',
  );
}
async function saveReferenceOption(db: Client, input: unknown) {
  const parsed = referenceOptionSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { id, ...values } = parsed.data;
  const result = id
    ? await db.from('reference_options').update(values).eq('id', id).select('id')
      .single()
    : await db.from('reference_options').insert(values).select('id').single();
  return saved(result, 'reference-option');
}
async function deleteReferenceOption(db: Client, input: unknown) {
  const parsed = referenceOptionDeleteSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { id, list_code: listCode, code } = parsed.data;
  const usage = listCode === 'ingredient_category'
    ? await db.from('ingredients').select('id', { count: 'exact', head: true }).eq('category', code)
    : listCode === 'feedback_type'
      ? await db.from('feedback_items').select('id', { count: 'exact', head: true }).eq('feedback_type', code)
      : { count: 0, error: null };
  if (usage.error) return saved(usage, 'reference-option-delete', false);
  if ((usage.count ?? 0) > 0) return { ok: false, message: 'This value is already in use. Deactivate it instead to preserve history.' };
  return saved(await db.from('reference_options').delete().eq('id', id), 'reference-option-delete', false);
}
async function saveUomFamily(db: Client, input: unknown) {
  const parsed = uomFamilySchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  return saved(await db.from('uom_families').upsert(parsed.data, { onConflict: 'organization_id,code' }).select('code').single(), 'uom-family', false);
}
async function saveUom(db: Client, input: unknown) {
  const parsed = uomSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { id, ...values } = parsed.data;
  const result = id
    ? await db.from('uoms').update(values).eq('id', id).select('id').single()
    : await db.from('uoms').insert(values).select('id').single();
  return saved(result, 'uom');
}
async function deleteUom(db: Client, input: unknown) {
  const parsed = uomDeleteSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const { id, code } = parsed.data;
  const [ingredientUsage, packUsage] = await Promise.all([
    db.from('ingredients').select('id', { count: 'exact', head: true }).eq('default_uom', code),
    db.from('supplier_items').select('id', { count: 'exact', head: true }).or(`purchase_uom.eq.${code},pack_quantity_uom.eq.${code}`),
  ]);
  if (ingredientUsage.error || packUsage.error) return { ok: false, message: 'Could not verify whether this unit is in use. Deactivate it instead.' };
  if ((ingredientUsage.count ?? 0) + (packUsage.count ?? 0) > 0) return { ok: false, message: 'This unit is already in use. Deactivate it instead to preserve history.' };
  return saved(await db.from('uoms').delete().eq('id', id), 'uom-delete', false);
}
async function saveAccessProfile(db: Client, input: unknown) {
  const parsed = accessProfileSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  return saved(
    await db.rpc('save_access_profile', { payload: parsed.data }),
    'access-profile',
  );
}
async function saveFeedback(db: Client, input: unknown) {
  const parsed = feedbackSchema.safeParse(input);
  if (!parsed.success) return invalidInput(parsed.error);
  const match = parsed.data.route.match(/^\/app\/ingredients\/([0-9a-f-]{36})$/);
  return saved(
    await db.from('feedback_items').insert({
      ...parsed.data,
      entity_type: match ? 'ingredient' : null,
      entity_id: match?.[1] ?? null,
      app_version: process.env.VERCEL_GIT_COMMIT_SHA ?? 'local',
    }),
    'feedback',
    false,
  );
}
async function saveFeedbackStatus(db: Client, input: unknown) {
  const parsed = feedbackStatusSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Invalid review.' };
  const { id, ...values } = parsed.data;
  return saved(
    await db.from('feedback_items').update(values).eq('id', id).select('id')
      .single(),
    'feedback-status',
  );
}
export const recordOperations = {
  ingredient: saveIngredient,
  supplier: saveSupplier,
  pack: savePack,
  allergen: saveAllergen,
  inventory: saveInventory,
  receipt: saveReceipt,
  'reference-option': saveReferenceOption,
  'reference-option-delete': deleteReferenceOption,
  'uom-family': saveUomFamily,
  uom: saveUom,
  'uom-delete': deleteUom,
  'access-profile': saveAccessProfile,
  feedback: saveFeedback,
  'feedback-status': saveFeedbackStatus,
} satisfies Record<RecordKind, (db: Client, input: unknown) => Promise<ActionResult>>;
export const recordPermissions: Record<RecordKind, string | null> = {
  ingredient: 'master_data.write',
  supplier: 'master_data.write',
  pack: 'master_data.write',
  allergen: 'master_data.write',
  inventory: 'inventory.adjust',
  receipt: 'inventory.receive',
  'feedback-status': 'feedback.manage',
  'reference-option': 'settings.manage',
  'reference-option-delete': 'settings.manage',
  'uom-family': 'settings.manage',
  uom: 'settings.manage',
  'uom-delete': 'settings.manage',
  'access-profile': 'settings.manage',
  feedback: null,
};
