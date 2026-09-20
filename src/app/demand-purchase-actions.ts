'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';
import { purchaseGenerationSchema, type PurchaseGeneration } from '@/domain/demand-coverage';

/** Recompute demand in one database transaction; the browser supplies only a retry ID. */
export default async function generateDemandPurchases(input: unknown): Promise<
{ ok: true; result: PurchaseGeneration } | { ok: false; message: string }
> {
  const id = z.uuid().safeParse(input);
  if (!id.success) return { ok: false, message: 'Invalid request. Reload and try again.' };
  const { db } = await requireProfile({ readOnly: false });
  try {
    const allowed = await Promise.all([
      'planning.write', 'planning.read', 'orders.read', 'inventory.read',
      'master_data.read', 'products.read',
    ].map((permission) => hasPermission(db, permission)));
    if (allowed.some((value) => !value)) {
      return { ok: false, message: 'Purchasing permissions required.' };
    }
    const response = await db.rpc('generate_demand_purchases', { request_id: id.data });
    if (response.error) throw response.error;
    const result = purchaseGenerationSchema.parse(response.data);
    ['/app', '/app/purchasing', '/app/suppliers', '/app/orders'].forEach((path) => revalidatePath(path));
    return { ok: true, result };
  } catch (error) {
    logFailure('generate_demand_purchases', error);
    return { ok: false, message: 'Could not confirm generation. Retry safely with this button.' };
  }
}
