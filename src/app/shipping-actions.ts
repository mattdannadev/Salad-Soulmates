'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { shippingDraftInputSchema, SHIPPING_MESSAGES } from '@/domain/shipping';
import type { ActionResult } from '@/domain/master-data';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';

/** Records preparation only. There is deliberately no confirmation or stock-posting action. */
export default async function saveShippingDraft(input: unknown): Promise<ActionResult> {
  const parsed = shippingDraftInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Check the date, method and whole-unit quantities.' };
  const { db } = await requireProfile({ readOnly: false });
  const allowed = await Promise.all(['orders.read', 'orders.write', 'planning.read', 'planning.write']
    .map((permission) => hasPermission(db, permission)));
  if (allowed.some((value) => !value)) return { ok: false, message: 'Order preparation permission required.' };
  try {
    const result = await db.rpc('save_shipping_draft', { payload: parsed.data });
    if (result.error) {
      logFailure('save_shipping_draft', result.error);
      return {
        ok: false,
        message: SHIPPING_MESSAGES.find((message) => result.error.message.includes(message))
          ?? 'Could not save shipping preparation. Retry with the same entries.',
      };
    }
    const saved = z.uuid().safeParse(result.data);
    if (!saved.success) {
      logFailure('save_shipping_draft', { code: 'INVALID_RESPONSE' });
      return { ok: false, message: 'Save not confirmed. Retry with the same entries.' };
    }
    revalidatePath('/app/shipping');
    return { ok: true, id: saved.data, message: 'Shipping draft saved. Nothing has shipped.' };
  } catch (error) {
    logFailure('save_shipping_draft', error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entries.' };
  }
}
