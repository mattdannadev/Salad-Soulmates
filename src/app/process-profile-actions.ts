'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/domain/master-data';
import { saveProcessProfileSchema } from '@/domain/process-profiles';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';

/** Assign the current recipe to a current Work Type; generated work is never modified. */
export default async function saveProcessProfile(input: unknown): Promise<ActionResult> {
  const parsed = saveProcessProfileSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose an active Work Type.' };
  const { db } = await requireProfile({ readOnly: false });
  const permitted = await Promise.all(['products.read', 'products.write'].map((code) => hasPermission(db, code)));
  if (permitted.some((allowed) => !allowed)) return { ok: false, message: 'Product and recipe management permission required.' };
  try {
    const result = await db.rpc('save_process_profile', { payload: parsed.data });
    if (result.error) {
      logFailure('save_process_profile', result.error);
      return { ok: false, message: result.error.message.includes('changed; reload')
        ? 'This process profile changed. Reload and try again.'
        : 'Could not save the process profile. Check the selected Work Type and retry.' };
    }
    const id = z.uuid().safeParse(result.data);
    if (!id.success) return { ok: false, message: 'The process profile could not be confirmed. Reload before retrying.' };
    revalidatePath('/app/recipes');
    revalidatePath('/app/products');
    return { ok: true, id: id.data, message: 'Process profile saved.' };
  } catch (error) {
    logFailure('save_process_profile', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}
