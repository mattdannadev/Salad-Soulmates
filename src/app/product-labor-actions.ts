'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import type { ActionResult } from '@/domain/master-data';

const optionalPositive = z.preprocess((value) => value === '' ? null : Number(value),
  z.number().finite().positive().max(1440).nullable());
const optionalCrew = z.preprocess((value) => value === '' ? null : Number(value),
  z.number().int().min(1).max(100).nullable());
const inputSchema = z.object({
  product_id: z.uuid(),
  ingredient_prep_minutes_per_batch: optionalPositive,
  ingredient_prep_crew_size: optionalCrew,
  mixing_minutes_per_batch: optionalPositive,
  mixing_crew_size: optionalCrew,
}).refine((value) => (value.ingredient_prep_minutes_per_batch === null)
  === (value.ingredient_prep_crew_size === null), 'Enter both ingredient prep values or leave both blank.')
  .refine((value) => (value.mixing_minutes_per_batch === null) === (value.mixing_crew_size === null),
    'Enter both mixing values or leave both blank.');

export async function saveProductLaborEstimate(input: unknown): Promise<ActionResult> {
  const parsed = inputSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Enter valid labor estimates.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'products.write')) return { ok: false, message: 'Product editing permission required.' };
  const { data, error } = await db.rpc('save_product_labor_estimate', { payload: parsed.data });
  if (error || !z.uuid().safeParse(data).success) return { ok: false, message: 'Could not save labor estimates. Reload and try again.' };
  revalidatePath('/app/products');
  return { ok: true, id: data, message: 'Production planning estimates saved.' };
}
