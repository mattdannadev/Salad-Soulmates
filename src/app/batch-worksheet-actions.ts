'use server';

import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { BATCH_WORKSHEET_MESSAGES, worksheetUsageInputSchema } from '@/domain/batch-worksheet';
import type { ActionResult } from '@/domain/master-data';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';

const operationSchema = z.enum(['open', 'use', 'complete']);

/** Calls the append-only worksheet RPCs; request UUIDs make use retries safe. */
export default async function saveBatchWorksheet(
  operation: unknown,
  input: unknown,
): Promise<ActionResult> {
  const kind = operationSchema.safeParse(operation);
  if (!kind.success) return { ok: false, message: 'Unknown worksheet action.' };
  const parsedUsage = kind.data === 'use'
    ? worksheetUsageInputSchema.safeParse(input)
    : null;
  const parsedId = kind.data === 'use'
    ? null
    : z.uuid().safeParse(input);
  if ((parsedUsage && !parsedUsage.success) || (parsedId && !parsedId.success)) {
    const issue = parsedUsage && !parsedUsage.success
      ? parsedUsage.error.issues[0]
      : parsedId?.error?.issues[0];
    return { ok: false, message: issue?.message ?? 'Check the worksheet entry.' };
  }
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'production.mobile')) {
    return { ok: false, message: 'Production worksheet permission required.' };
  }
  try {
    let result;
    if (kind.data === 'use' && parsedUsage?.success) {
      result = await db.rpc('record_batch_worksheet_usage', { payload: parsedUsage.data });
    } else if (kind.data === 'open') {
      result = await db.rpc('open_batch_worksheet', { batch_id: parsedId?.data ?? '' });
    } else {
      result = await db.rpc('complete_batch_worksheet', { execution_id: parsedId?.data ?? '' });
    }
    if (result.error) {
      logFailure(`batch_worksheet_${kind.data}`, result.error);
      return { ok: false, message: BATCH_WORKSHEET_MESSAGES.find((message) => result.error.message.includes(message)) ?? 'Could not save the worksheet. Check the entry and retry.' };
    }
    const id = z.uuid().safeParse(result.data);
    if (!id.success) {
      logFailure(`batch_worksheet_${kind.data}`, { code: 'INVALID_RESPONSE' });
      return { ok: false, message: 'The worksheet save could not be confirmed. Retry with the same entry.' };
    }
    revalidatePath('/worker');
    return { ok: true, id: id.data, message: kind.data === 'complete' ? 'Batch worksheet completed.' : 'Worksheet progress saved.' };
  } catch (error) {
    logFailure(`batch_worksheet_${kind.data}`, error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entry.' };
  }
}
