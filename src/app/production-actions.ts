'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { productionInputSchema, productionLotInputSchema, PRODUCTION_MESSAGES } from '@/domain/production';
import type { ActionResult } from '@/domain/master-data';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';

/** Save an order's preparation atomically; revision is retained across lost-response retries. */
export default async function saveProduction(input: unknown): Promise<ActionResult> {
  const parsed = productionInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check production details.' };
  const { db } = await requireProfile({ readOnly: false });
  const allowed = await Promise.all(['orders.read', 'orders.write', 'planning.read', 'planning.write', 'inventory.read']
    .map((permission) => hasPermission(db, permission)));
  if (allowed.some((permission) => !permission)) return { ok: false, message: 'Production planning permission required.' };
  try {
    const result = await db.rpc('save_order_production_plan', { payload: parsed.data });
    if (result.error) {
      logFailure('save_production', result.error);
      return {
        ok: false,
        message: PRODUCTION_MESSAGES.find((message) => result.error.message.includes(message))
        ?? 'Could not save production preparation. Check the values and retry.',
      };
    }
    const saved = z.uuid().safeParse(result.data);
    if (!saved.success) {
      logFailure('save_production', { code: 'INVALID_RESPONSE' });
      return { ok: false, message: 'The save could not be confirmed. Retry with the same entries.' };
    }
    revalidatePath('/app/orders');
    revalidatePath('/app/purchasing');
    return { ok: true, id: saved.data, message: 'Production preparation saved.' };
  } catch (error) {
    logFailure('save_production', error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entries.' };
  }
}

/** Assign a product-specific DDDYY lot to its already-planned batch/spice pairs. */
export async function assignProductionLot(input: unknown): Promise<ActionResult> {
  const parsed = productionLotInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check production lot details.' };
  const { db } = await requireProfile({ readOnly: false });
  const allowed = await Promise.all(['orders.read', 'orders.write', 'planning.read', 'planning.write']
    .map((permission) => hasPermission(db, permission)));
  if (allowed.some((permission) => !permission)) return { ok: false, message: 'Production lot permission required.' };
  try {
    const result = await db.rpc('assign_production_lot', { payload: parsed.data });
    if (result.error) {
      logFailure('assign_production_lot', result.error);
      return { ok: false, message: PRODUCTION_MESSAGES.find((message) => result.error.message.includes(message)) ?? 'Could not assign production lot. Check the values and retry.' };
    }
    const saved = z.uuid().safeParse(result.data);
    if (!saved.success) return { ok: false, message: 'The lot assignment could not be confirmed. Retry with the same entries.' };
    revalidatePath('/app/orders');
    return { ok: true, id: saved.data, message: 'Production lot assigned.' };
  } catch (error) {
    logFailure('assign_production_lot', error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entries.' };
  }
}
