import 'server-only';

import { z } from 'zod';
import {
  moveScheduleEventChain, moveWorkOrderChain, readWorkOrderDependencies, removeWorkOrder,
  writeScheduleEventPredecessors, writeWorkOrderPredecessors,
} from '@/data/work-orders';
import type { ActionResult } from '@/domain/master-data';
import {
  deleteWorkOrderSchema, moveDependentWorkSchema, setWorkOrderPredecessorsSchema,
  workOrderDependencySchema, workOrderDependencyScopeSchema,
} from '@/domain/work-orders';
import { requireProfile } from '@/lib/auth';
import { logFailure, operationError } from '@/lib/operation-error';
import hasPermission from '@/lib/permissions';

/** Load durable dependency edges for the signed-in user's current facility. */
export async function loadWorkOrderDependencies(facilityId: string) {
  const scope = workOrderDependencyScopeSchema.parse({ facility_id: facilityId });
  const { db, profile } = await requireProfile();
  if (profile.facility_id !== scope.facility_id || !await hasPermission(db, 'workforce.read')) return null;
  const result = await readWorkOrderDependencies(db, scope);
  if (result.error) {
    throw operationError(
      'work_order_dependencies_load',
      'Unable to load work order dependencies.',
      result.error,
    );
  }
  return z.array(workOrderDependencySchema).parse(result.data);
}

const knownDependencyErrors = [
  'Work order changed; reload and try again',
  'Work order unavailable',
  'Work order predecessor unavailable',
  'Work order dependencies cannot contain a cycle',
  'Completed work dependencies cannot be changed',
  'Started or completed work cannot be deleted',
  'Schedule changed; reload and try again',
  'Schedule event unavailable',
  'Schedule predecessor unavailable',
  'Schedule dependencies cannot contain a cycle',
  'Scheduled work changed; reload and try again',
  'Completed work cannot be moved',
  'Completed dependent work cannot be moved',
  'Dependent work is not available to move',
  'Completed or cancelled work cannot be changed',
  'Generated work scope cannot be changed in the planner',
];

function safeDependencyError(message: string, fallback: string) {
  return knownDependencyErrors.find((known) => message.includes(known)) ?? fallback;
}

/** Authorize and atomically replace one work order's predecessor set. */
export async function setWorkOrderPredecessors(input: unknown): Promise<ActionResult> {
  const parsed = setWorkOrderPredecessorsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose valid work order predecessors.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  if (profile.facility_id !== parsed.data.facility_id
    || !await hasPermission(db, 'workforce.manage')) {
    return { ok: false, message: 'Scheduler access is required.' };
  }
  try {
    const result = await writeWorkOrderPredecessors(db, parsed.data);
    if (result.error) {
      logFailure('work_order_predecessors_set', result.error);
      return {
        ok: false,
        message: safeDependencyError(
          result.error.message,
          'Unable to save work order dependencies. Reload and try again.',
        ),
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Dependencies updated.' }
      : { ok: false, message: 'The dependency change could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure('work_order_predecessors_set', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

/** Compatibility use case for scheduler events pending their canonical Work migration. */
export async function setScheduleEventPredecessors(input: unknown): Promise<ActionResult> {
  const parsed = setWorkOrderPredecessorsSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose valid schedule predecessors.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  if (profile.facility_id !== parsed.data.facility_id
    || !await hasPermission(db, 'workforce.manage')) {
    return { ok: false, message: 'Scheduler access is required.' };
  }
  try {
    const result = await writeScheduleEventPredecessors(db, parsed.data);
    if (result.error) {
      logFailure('schedule_event_predecessors_set', result.error);
      return {
        ok: false,
        message: safeDependencyError(
          result.error.message,
          'Unable to save schedule dependencies. Reload and try again.',
        ),
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Dependencies updated.' }
      : { ok: false, message: 'The dependency change could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure('schedule_event_predecessors_set', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

/** Audit-cancel a work order while the database transaction relinks its successors. */
export async function deleteWorkOrder(input: unknown): Promise<ActionResult> {
  const parsed = deleteWorkOrderSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid work order.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  if (profile.facility_id !== parsed.data.facility_id
    || !await hasPermission(db, 'workforce.manage')) {
    return { ok: false, message: 'Scheduler access is required.' };
  }
  try {
    const result = await removeWorkOrder(db, parsed.data);
    if (result.error) {
      logFailure('work_order_delete', result.error);
      return {
        ok: false,
        message: safeDependencyError(
          result.error.message,
          'Unable to delete the work order. Reload and try again.',
        ),
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Work order deleted.' }
      : { ok: false, message: 'The deletion could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure('work_order_delete', error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

async function moveDependentChain(
  input: unknown,
  storage: 'work_order' | 'schedule_event',
): Promise<ActionResult> {
  const parsed = moveDependentWorkSchema.safeParse(input);
  if (!parsed.success) return { ok: false, message: 'Choose a valid work time.' };
  const { db, profile } = await requireProfile({ readOnly: false });
  if (profile.facility_id !== parsed.data.facility_id
    || !await hasPermission(db, 'workforce.manage')) {
    return { ok: false, message: 'Scheduler access is required.' };
  }
  const operation = storage === 'work_order' ? 'work_order_chain_move' : 'schedule_event_chain_move';
  try {
    const result = storage === 'work_order'
      ? await moveWorkOrderChain(db, parsed.data)
      : await moveScheduleEventChain(db, parsed.data);
    if (result.error) {
      logFailure(operation, result.error);
      return {
        ok: false,
        message: safeDependencyError(
          result.error.message,
          'Unable to move dependent work. Reload and try again.',
        ),
      };
    }
    const id = z.uuid().safeParse(result.data);
    return id.success ? { ok: true, id: id.data, message: 'Dependent work moved.' }
      : { ok: false, message: 'The move could not be confirmed. Reload before retrying.' };
  } catch (error) {
    logFailure(operation, error);
    return { ok: false, message: 'Connection interrupted. Reload before retrying.' };
  }
}

export function moveWorkOrderWithSuccessors(input: unknown) {
  return moveDependentChain(input, 'work_order');
}

export function moveScheduleEventWithSuccessors(input: unknown) {
  return moveDependentChain(input, 'schedule_event');
}
