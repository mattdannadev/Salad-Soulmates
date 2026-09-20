'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';
import {
  materialPlanInputSchema,
  purchaseDraftInputSchema,
  purchaseStatusInputSchema,
} from '@/domain/purchasing';
import type { ActionResult } from '@/domain/master-data';

const operationSchema = z.enum([
  'save-plan',
  'create-draft',
  'change-status',
  'cancel-plan',
]);
const inputSchemas = {
  'save-plan': materialPlanInputSchema,
  'create-draft': purchaseDraftInputSchema,
  'change-status': purchaseStatusInputSchema,
  'cancel-plan': z.object({ id: z.uuid() }),
};
const safeDatabaseMessages = [
  'Request ID already used with different values',
  'Purchase changed; reload before trying again',
  'Cancel linked draft purchases before cancelling this worksheet',
  'Recipe ingredient must be active with a validated quantity in its base unit (four decimals)',
  'Choose a released recipe for an active 40-gallon product',
  'Configure a validated pack in the ingredient base unit',
  'This ingredient has no current shortage',
  'A purchase quantity override requires a reason',
  'Received purchases cannot be cancelled',
];

/** Authorize at the action boundary and again through database RLS/validated functions. */
export default async function savePurchasing(
  operation: string,
  input: unknown,
): Promise<ActionResult> {
  const kind = operationSchema.safeParse(operation);
  if (!kind.success) return { ok: false, message: 'Unknown purchasing action.' };
  const validated = inputSchemas[kind.data].safeParse(input);
  if (!validated.success) {
    return {
      ok: false,
      message: validated.error.issues[0]?.message ?? 'Check the submitted values.',
    };
  }
  const { db } = await requireProfile({ readOnly: false });
  const permissions = await Promise.all(
    [
      'planning.write',
      'planning.read',
      'inventory.read',
      'products.read',
      'master_data.read',
    ].map((permission) => hasPermission(db, permission)),
  );
  if (permissions.some((allowed) => !allowed)) return { ok: false, message: 'Purchasing permission required.' };
  try {
    let result;
    switch (kind.data) {
      case 'save-plan':
        result = await db.rpc('save_material_plan', { payload: validated.data });
        break;
      case 'create-draft':
        result = await db.rpc('create_purchase_draft', { payload: validated.data });
        break;
      case 'change-status':
        result = await db.rpc('change_purchase_status', { payload: validated.data });
        break;
      case 'cancel-plan':
        result = await db.rpc('cancel_material_plan', { plan_id: validated.data.id });
        break;
      default:
        throw new Error('Unsupported purchasing action.');
    }
    if (result.error) {
      logFailure(`purchasing_${kind.data}`, result.error);
      const databaseMessage = result.error.message;
      const message = safeDatabaseMessages.find((candidate) => databaseMessage.includes(candidate));
      return {
        ok: false,
        message:
          message
          ?? (result.error.code === '23505'
            ? 'An open draft already exists for this supplier and worksheet. Review it before creating another.'
            : 'Could not save. Check the values and retry; your entries are preserved.'),
      };
    }
    const saved = z
      .union([z.uuid(), z.object({ id: z.uuid() }).transform((row) => row.id)])
      .safeParse(result.data);
    if (!saved.success) {
      logFailure(`purchasing_${kind.data}`, { code: 'INVALID_RESPONSE' });
      return {
        ok: false,
        message: 'The save could not be confirmed. Retry with the same entries.',
      };
    }
    revalidatePath('/app/materials');
    revalidatePath('/app/purchasing');
    revalidatePath('/app/receiving');
    revalidatePath('/receiving');
    return { ok: true, id: saved.data, message: 'Saved successfully.' };
  } catch (error) {
    logFailure(`purchasing_${kind.data}`, error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entries.' };
  }
}
