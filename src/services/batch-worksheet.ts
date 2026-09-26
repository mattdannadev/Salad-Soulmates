import 'server-only';

import { z } from 'zod';
import { BATCH_WORKSHEET_MESSAGES, worksheetCorrectionInputSchema, worksheetIssueInputSchema, worksheetUsageInputSchema } from '@/domain/batch-worksheet';
import type { ActionResult } from '@/domain/master-data';
import { saveWorksheetRecord } from '@/data/batch-worksheet';
import type { WorksheetOperation } from '@/data/batch-worksheet';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure } from '@/lib/operation-error';

const operationSchema = z.enum(['open', 'use', 'correct', 'issue', 'complete']);

/** Authorization and validation for a worker's worksheet change. */
export default async function saveBatchWorksheetService(operation: unknown, input: unknown): Promise<ActionResult> {
  const kind = operationSchema.safeParse(operation);
  if (!kind.success) return { ok: false, message: 'Unknown worksheet action.' };
  const schema = kind.data === 'use' ? worksheetUsageInputSchema
    : kind.data === 'correct' ? worksheetCorrectionInputSchema
      : kind.data === 'issue' ? worksheetIssueInputSchema : z.uuid();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return { ok: false, message: parsed.error.issues[0]?.message ?? 'Check the worksheet entry.' };
  const { db } = await requireProfile({ readOnly: false });
  if (!await hasPermission(db, 'production.mobile')) {
    return { ok: false, message: 'Production worksheet permission required.' };
  }
  try {
    const result = await saveWorksheetRecord(db, kind.data as WorksheetOperation, parsed.data);
    if (result.error) {
      logFailure(`batch_worksheet_${kind.data}`, result.error);
      return { ok: false, message: BATCH_WORKSHEET_MESSAGES.find((message) => result.error.message.includes(message))
        ?? 'Could not save the worksheet. Check the entry and retry.' };
    }
    const id = z.uuid().safeParse(result.data);
    if (!id.success) {
      logFailure(`batch_worksheet_${kind.data}`, { code: 'INVALID_RESPONSE' });
      return { ok: false, message: 'The worksheet save could not be confirmed. Retry with the same entry.' };
    }
    return { ok: true, id: id.data, message: kind.data === 'complete' ? 'Spice preparation completed and inventory relieved.'
      : kind.data === 'issue' ? 'Problem noted for this preparation.'
        : kind.data === 'correct' ? 'Blend allocation updated.' : 'Spice preparation progress saved.' };
  } catch (error) {
    logFailure(`batch_worksheet_${kind.data}`, error);
    return { ok: false, message: 'Connection interrupted. Retry with the same entry.' };
  }
}
