'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';
import {
  purchaseDraftInputSchema,
  purchaseStatusInputSchema,
} from '@/domain/purchasing';
import { customerOptionInputSchema, customerRowSchema } from '@/domain/customer-pricing';
import { customerOrderInputSchema } from '@/domain/customer-orders';
import type { ActionResult } from '@/domain/master-data';

const operationSchema = z.enum([
  'save-customer',
  'save-option',
  'save-order',
  'cancel-order',
  'create-draft',
  'change-status',
  'cancel-plan',
]);
const inputSchemas = {
  'save-customer': customerRowSchema,
  'save-option': customerOptionInputSchema,
  'save-order': customerOrderInputSchema,
  'cancel-order': z.object({ id: z.uuid() }),
  'create-draft': purchaseDraftInputSchema,
  'change-status': purchaseStatusInputSchema,
  'cancel-plan': z.object({ id: z.uuid() }),
};
const safeDatabaseMessages = [
  'Customer changed; reload before saving',
  'Customer name cannot be changed here',
  'Cancel production preparation before cancelling this order',
  'Request ID already used with different values',
  'Customer option changed; reload before trying again',
  'Order line value exceeds supported precision',
  'Choose an active packaging option for this customer and product',
  'Batch quantity must divide into whole packaging units; review the batch count or packaging',
  'Each product needs exactly one active released 40-gallon recipe',
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
  let requiredPermissions = [
    ...(kind.data === 'save-order' || kind.data === 'cancel-order' ? ['orders.write', 'orders.read'] : []),
    'planning.write', 'planning.read', 'inventory.read', 'products.read', 'master_data.read',
  ];
  if (kind.data === 'save-customer') requiredPermissions = ['orders.read', 'orders.write'];
  if (kind.data === 'save-option') requiredPermissions = ['products.read', 'products.write'];
  const permissions = await Promise.all(
    requiredPermissions.map((permission) => hasPermission(db, permission)),
  );
  if (permissions.some((allowed) => !allowed)) return { ok: false, message: 'Permission required to save this change.' };
  try {
    let result;
    switch (kind.data) {
      case 'save-customer':
        result = await db.rpc('save_customer_master', { payload: validated.data });
        break;
      case 'save-option':
        result = await db.rpc('save_customer_product_option', { payload: validated.data });
        break;
      case 'save-order':
        result = await db.rpc('save_customer_order', { payload: validated.data });
        break;
      case 'cancel-order':
        result = await db.rpc('cancel_customer_order', { order_id: validated.data.id });
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
          message?.replace('this worksheet', 'this order')
          ?? (result.error.code === '23505'
            ? 'An entry with these details already exists. Review it before adding another.'
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
    revalidatePath('/app/products');
    revalidatePath('/app/customers');
    revalidatePath('/app');
    revalidatePath('/app/orders');
    revalidatePath('/app/materials');
    revalidatePath('/app/purchasing');
    revalidatePath('/app/suppliers');
    revalidatePath('/app/receiving');
    revalidatePath('/receiving');
    return { ok: true, id: saved.data, message: 'Saved successfully.' };
  } catch (error) {
    logFailure(`purchasing_${kind.data}`, error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entries.' };
  }
}
