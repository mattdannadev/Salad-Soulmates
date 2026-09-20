'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { packagingInputSchema, PACKAGING_MESSAGES } from '@/domain/packaging';
import type { ActionResult } from '@/domain/master-data';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';

/** Append an immutable draft/approved version; the caller retains its request ID for retries. */
export default async function savePackaging(input: unknown): Promise<ActionResult> {
  const parsed = packagingInputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check packaging details.' };
  const { db } = await requireProfile({ readOnly: false });
  const allowed = await Promise.all(['products.read', 'products.write'].map((permission) => hasPermission(db, permission)));
  if (allowed.some((permission) => !permission)) return { ok: false, message: 'Product setup permission required' };
  try {
    const result = await db.rpc('save_packaging_profile', { payload: parsed.data });
    if (result.error) {
      logFailure('save_packaging', result.error);
      return { ok: false, message: PACKAGING_MESSAGES.find((message) => result.error.message.includes(message)) ?? 'Could not save packaging setup. Check the values and retry.' };
    }
    const saved = z.uuid().safeParse(result.data);
    if (!saved.success) {
      logFailure('save_packaging', { code: 'INVALID_RESPONSE' });
      return { ok: false, message: 'The save could not be confirmed. Retry with the same entries.' };
    }
    revalidatePath('/app/products');
    revalidatePath('/app/orders');
    return { ok: true, id: saved.data, message: parsed.data.status === 'Approved' ? 'Packaging version approved.' : 'Packaging draft saved.' };
  } catch (error) {
    logFailure('save_packaging', error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entries.' };
  }
}
