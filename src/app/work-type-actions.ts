'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import type { ActionResult } from '@/domain/master-data';
import { workOrderQueueKinds } from '@/domain/process-profiles';
import { requireProfile } from '@/lib/auth';
import { logFailure } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';

const codeSchema = z.string().regex(/^[a-z][a-z0-9_]{1,79}$/);

const saveWorkTypeSchema = z.object({
  id: z.uuid(),
  expected_revision: z.number().int().nonnegative(),
  code: codeSchema,
  name: z.string().trim().min(2).max(120),
  description: z.string().max(1000),
  active: z.boolean(),
  work_order_types: z.array(z.object({
    code: codeSchema,
    name: z.string().trim().min(2).max(120),
    queue_kind: z.enum(workOrderQueueKinds),
  }).strict()).min(1).max(20),
}).strict().superRefine((value, context) => {
  const codes = value.work_order_types.map((workOrderType) => workOrderType.code);
  if (new Set(codes).size !== codes.length) {
    context.addIssue({
      code: 'custom',
      message: 'Each Work Order Type must have a unique code.',
      path: ['work_order_types'],
    });
  }
});

/** Saves current Work Type setup without changing already generated work. */
export default async function saveWorkType(input: unknown): Promise<ActionResult> {
  const parsed = saveWorkTypeSchema.safeParse(input);
  if (!parsed.success) {
    return { ok: false, message: 'Enter a name and at least one complete Work Order Type.' };
  }

  const { db } = await requireProfile({ readOnly: false });
  const permissions = await Promise.all(
    ['products.read', 'products.write'].map((permission) => hasPermission(db, permission)),
  );
  if (permissions.some((allowed) => !allowed)) {
    return { ok: false, message: 'Product and recipe management permission required.' };
  }

  try {
    const result = await db.rpc('save_work_type', { payload: parsed.data });
    if (result.error) {
      logFailure('save_work_type', result.error);
      return {
        ok: false,
        message: result.error.message.includes('changed; reload')
          ? 'This Work Type changed. Reload and try again.'
          : 'Could not save the Work Type. Check its details and try again.',
      };
    }

    const id = z.uuid().safeParse(result.data);
    if (!id.success) {
      return { ok: false, message: 'The Work Type could not be confirmed. Reload before retrying.' };
    }

    revalidatePath('/app/settings/work-types');
    revalidatePath('/app/recipes');
    revalidatePath('/app/products');
    return { ok: true, id: id.data, message: 'Work Type saved.' };
  } catch (error) {
    logFailure('save_work_type', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}
