import 'server-only';

import { z } from 'zod';
import {
  readFacilitySchedule, readMySchedule, readWorkQueueContext, writeSchedule,
} from '@/data/scheduling';
import type { ScheduleMutation } from '@/data/scheduling';
import type { ActionResult } from '@/domain/master-data';
import {
  myWorkforceScheduleSchema, scheduleLinkedTaskSchema, scheduleRangeSchema, workforceScheduleSchema,
} from '@/domain/scheduling';
import { requireProfile } from '@/lib/auth';
import { logFailure, operationError } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';

/** Load only the signed-in user's facility and the requested calendar interval. */
export default async function loadSchedule(facilityId: string, startOn: string, endOn: string) {
  const range = scheduleRangeSchema.parse({
    facility_id: facilityId, start_on: startOn, end_on: endOn,
  });
  const { db, profile } = await requireProfile();
  if (profile.facility_id !== range.facility_id || !await hasPermission(db, 'workforce.read')) return null;
  const [canManage, canManageSettings] = await Promise.all([
    hasPermission(db, 'workforce.manage'), hasPermission(db, 'settings.manage'),
  ]);
  const [result, context] = await Promise.all([
    readFacilitySchedule(db, range), readWorkQueueContext(db, range),
  ]);
  if (result.error) throw operationError('workforce_schedule_load', 'Unable to load the worker schedule.', result.error);
  if (context.error) throw operationError('work_queue_context_load', 'Unable to load available work context.', context.error);
  const schedule = workforceScheduleSchema.parse(result.data);
  const workContext = z.array(scheduleLinkedTaskSchema).parse(context.data);
  return {
    ...schedule,
    linked_tasks: [...schedule.linked_tasks, ...workContext],
    canManage,
    canManageSettings,
  };
}

/** Worker view is scoped by the database to the caller's identity and latest publication. */
export async function loadMyWorkforceSchedule(startOn: string, endOn: string) {
  const range = z.object({ start_on: z.iso.date(), end_on: z.iso.date() })
    .refine((value) => value.end_on > value.start_on).parse({
      start_on: startOn, end_on: endOn,
    });
  const { db } = await requireProfile();
  const result = await readMySchedule(db, range);
  if (result.error) throw operationError('my_workforce_schedule_load', 'Unable to load your schedule.', result.error);
  return myWorkforceScheduleSchema.parse(result.data);
}

const knownErrors = [
  'Schedule changed; reload and try again', 'Invalid employee selection',
  'Invalid production plan', 'Facility unavailable', 'Schedule event unavailable',
  'PTO changed; reload and try again', 'Invalid linked task',
];
const conflictErrorPrefixes = [
  'Assignment conflicts with ', 'Approved PTO conflicts with ',
  'Availability override reason required for ', 'PTO conflicts with ',
];

function safeScheduleError(message: string): string {
  if (message.length <= 300 && conflictErrorPrefixes.some((prefix) => message.startsWith(prefix))) {
    return message;
  }
  return knownErrors.find((known) => message.includes(known))
    ?? 'Could not save the schedule. Check the values and retry.';
}

/** Authorize and persist a facility-scoped schedule use case. */
export async function commitScheduleMutation(
  operation: ScheduleMutation,
  payload: { facility_id: string },
  requiredPermission: 'workforce.manage' | 'settings.manage',
): Promise<ActionResult> {
  const { db, profile } = await requireProfile({ readOnly: false });
  if (profile.facility_id !== payload.facility_id || !await hasPermission(db, requiredPermission)) {
    return { ok: false, message: 'Facility scheduling permission required.' };
  }
  try {
    const result = await writeSchedule(db, operation, payload);
    if (result.error) {
      logFailure(operation, result.error);
      return { ok: false, message: safeScheduleError(result.error.message) };
    }
    const id = z.uuid().safeParse(result.data);
    if (!id.success) {
      logFailure(operation, { code: 'INVALID_RESPONSE' });
      return { ok: false, message: 'The change could not be confirmed. Reload before retrying.' };
    }
    return { ok: true, id: id.data, message: 'Schedule updated.' };
  } catch (error) {
    logFailure(operation, error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}
