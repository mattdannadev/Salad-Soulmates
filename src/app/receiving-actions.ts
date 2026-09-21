'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';
import { serializeLineSchema, serializedReceiptSchema, unitChangeSchema } from '@/domain/receiving';
import type { ActionResult } from '@/domain/master-data';

const schemas = {
  receive: serializedReceiptSchema,
  serialize: serializeLineSchema,
  change: unitChangeSchema,
};
const operations = {
  receive: 'receive_serialized_delivery',
  serialize: 'serialize_receipt_line',
  change: 'change_serialized_unit',
} as const;
const safeMessages = [
  'Package quantities must equal the received quantity',
  'Source lot is required before serialization',
  'Receipt already serialized with different values',
  'Request ID already used with different values',
  'Package changed; reload before trying again',
  'Remaining quantity cannot exceed the original package quantity',
  'No package change was entered',
  'Choose a matching active supplier item in the base unit',
  'Receipt exceeds the outstanding inbound quantity',
  'Receipt must match inbound supplier, ingredient and base unit',
  'Select confirmed inbound for this facility',
];

/** Preserve request IDs across transport retries; database transactions own inventory changes. */
export default async function saveReceiving(
  operation: string,
  input: unknown,
): Promise<ActionResult> {
  const kind = z.enum(['receive', 'serialize', 'change']).safeParse(operation);
  if (!kind.success) return { ok: false, message: 'Unknown receiving action.' };
  const parsed = schemas[kind.data].safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the fields.' };
  const { db } = await requireProfile({ readOnly: false });
  const permissions = await Promise.all([
    hasPermission(db, 'inventory.read'),
    hasPermission(db, kind.data === 'change' ? 'inventory.adjust' : 'inventory.receive'),
  ]);
  if (permissions.some((allowed) => !allowed)) return { ok: false, message: 'Receiving or inventory adjustment permission required.' };
  try {
    const result = await db.rpc(operations[kind.data], { payload: parsed.data });
    if (result.error) {
      logFailure(`receiving_${kind.data}`, result.error);
      return {
        ok: false,
        message:
          safeMessages.find((message) => result.error.message.includes(message))
          ?? (result.error.code === '23505'
            ? 'This barcode or request is already in use. Give each physical package a unique identity.'
            : 'Could not save. Check your entries and retry with the same request.'),
      };
    }
    const id = z.uuid().safeParse(result.data);
    if (!id.success) {
      logFailure(`receiving_${kind.data}`, { code: 'INVALID_RESPONSE' });
      return { ok: false, message: 'Save could not be confirmed. Retry with the same entries.' };
    }
    [
      '/app/receiving',
      '/receiving',
      '/app/inventory',
      '/app/materials',
      '/app/orders',
      '/app/purchasing',
      '/app/suppliers',
      '/receiving/packages',
      '/receiving/labels',
    ].forEach((path) => revalidatePath(path));
    revalidatePath('/receiving/packages/[id]', 'page');
    return {
      ok: true,
      id: id.data,
      message:
        kind.data === 'receive'
          ? 'Receipt posted, inventory updated, and packages serialized.'
          : 'Package records saved.',
    };
  } catch (error) {
    logFailure(`receiving_${kind.data}`, error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entries.' };
  }
}
