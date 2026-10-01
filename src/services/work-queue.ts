import 'server-only';

import { z } from 'zod';
import {
  claimWorkQueueItem, createWorkQueueItem, publishWorkQueue, readMyWorkQueue, unclaimWorkQueueItem,
} from '@/data/work-queue';
import {
  createWorkQueueItemSchema, publishWorkQueueSchema, workQueueClaimSchema,
  workQueueRangeSchema, workerQueueItemSchema,
} from '@/domain/work-queue';
import type { ActionResult } from '@/domain/master-data';
import { requireProfile } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { logFailure, operationError } from '@/lib/operation-error';

export async function loadMyWorkQueue(startOn: string, endOn: string) {
  const range = workQueueRangeSchema.parse({ start_on: startOn, end_on: endOn });
  const { db } = await requireProfile();
  const result = await readMyWorkQueue(db, range);
  if (result.error) throw operationError('worker_queue_load', 'Unable to load your work queue.', result.error);
  return z.array(workerQueueItemSchema).parse(result.data);
}

export async function claimPublishedWorkQueueItem(input: unknown): Promise<ActionResult> {
  const parsed = workQueueClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'This work item is no longer valid. Reload and try again.' };
  const { db } = await requireProfile({ readOnly: false });
  try {
    const result = await claimWorkQueueItem(db, parsed.data);
    if (result.error) {
      logFailure('worker_queue_claim', result.error);
      const safeMessages = [
        'Work queue changed; reload and try again', 'Work item is unavailable',
        'Work item already has its required workers', 'You have already claimed this work item',
        'This plant requires supervisor assignment',
      ];
      return {
        ok: false,
        message: safeMessages.find((message) => result.error.message.includes(message))
          ?? 'Unable to claim this work item. Reload and try again.',
      };
    }
    const id = z.uuid().safeParse(result.data);
    if (!id.success) return { ok: false, message: 'The claim could not be confirmed. Reload before retrying.' };
    return { ok: true, id: id.data, message: 'Work claimed.' };
  } catch (error) {
    logFailure('worker_queue_claim', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

export async function unclaimPublishedWorkQueueItem(input: unknown): Promise<ActionResult> {
  const parsed = workQueueClaimSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'This work item is no longer valid. Reload and try again.' };
  const { db } = await requireProfile({ readOnly: false });
  try {
    const result = await unclaimWorkQueueItem(db, parsed.data);
    if (result.error) {
      logFailure('worker_queue_unclaim', result.error);
      return { ok: false, message: result.error.message.includes('You have not claimed this work item')
        ? 'You have not claimed this work item.' : 'Unable to unclaim this work item. Reload and try again.' };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Work returned to the queue.' }
      : { ok: false, message: 'The change could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure('worker_queue_unclaim', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

export async function createScheduledWorkQueueItem(input: unknown): Promise<ActionResult> {
  const parsed = createWorkQueueItemSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Enter a valid task, date, and crew size.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  if (profile.facility_id !== parsed.data.facility_id) return { ok: false, message: 'Plant access is required.' };
  if (!await hasPermission(db, 'workforce.manage')) return { ok: false, message: 'Scheduler access is required.' };
  const result = await createWorkQueueItem(db, parsed.data);
  if (result.error) {
    logFailure('work_queue_create', result.error);
    return { ok: false, message: 'Unable to create the work item. Reload and try again.' };
  }
  const id = z.uuid().safeParse(result.data);
  return id.success ? { ok: true, id: id.data, message: 'Draft work added.' }
    : { ok: false, message: 'The work item could not be confirmed. Reload before retrying.' };
}

export async function publishScheduledWorkQueue(input: unknown): Promise<ActionResult> {
  const parsed = publishWorkQueueSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid work date.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  if (profile.facility_id !== parsed.data.facility_id) return { ok: false, message: 'Plant access is required.' };
  if (!await hasPermission(db, 'workforce.manage')) return { ok: false, message: 'Scheduler access is required.' };
  const result = await publishWorkQueue(db, parsed.data);
  if (result.error) {
    logFailure('work_queue_publish', result.error);
    return { ok: false, message: 'Unable to publish daily work. Reload and try again.' };
  }
  return { ok: true, message: `${Number(result.data) || 0} work item(s) published.` };
}
