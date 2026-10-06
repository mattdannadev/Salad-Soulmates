import 'server-only';

import { z } from 'zod';
import {
  readFacilitySchedule, readMySchedule, readScheduleBatchContext, readScheduleCustomerOrders,
  readScheduleCustomerProducts, readScheduleSupplierDeliveries, readWorkQueueContext, writeSchedule,
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
  if (profile.facility_id !== range.facility_id
    || !await hasPermission(db, 'workforce.read')) return null;
  const [canManage, canManageSettings] = await Promise.all([
    hasPermission(db, 'workforce.manage'), hasPermission(db, 'settings.manage'),
  ]);
  const [
    result,
    context,
    customerProducts,
    batchContext,
    customerOrders,
    supplierDeliveries,
  ] = await Promise.all([
    readFacilitySchedule(db, range), readWorkQueueContext(db, range),
    readScheduleCustomerProducts(db, { facility_id: facilityId }),
    readScheduleBatchContext(db, { facility_id: facilityId }),
    readScheduleCustomerOrders(db, range),
    readScheduleSupplierDeliveries(db, range),
  ]);
  if (result.error) throw operationError('workforce_schedule_load', 'Unable to load the worker schedule.', result.error);
  if (context.error) throw operationError('work_queue_context_load', 'Unable to load available work context.', context.error);
  if (customerProducts.error) throw operationError('schedule_customer_products_load', 'Unable to load customer products.', customerProducts.error);
  if (batchContext.error) throw operationError('schedule_batch_context_load', 'Unable to load production batch context.', batchContext.error);
  if (customerOrders.error) throw operationError('schedule_customer_orders_load', 'Unable to load customer orders.', customerOrders.error);
  if (supplierDeliveries.error) throw operationError('schedule_supplier_deliveries_load', 'Unable to load supplier deliveries.', supplierDeliveries.error);
  const schedule = workforceScheduleSchema.parse(result.data);
  const workContext = z.array(scheduleLinkedTaskSchema).parse(context.data);
  const readableBatchContext = z.array(scheduleLinkedTaskSchema).parse(batchContext.data);
  const readableCustomerOrders = z.array(z.object({
    created_on: z.iso.date().optional(),
    id: z.uuid(),
    customer_id: z.uuid(),
    customer_name: z.string(),
    reference: z.string(),
    needed_on: z.iso.date(),
    // Rollups were added after the base order schedule RPC. During a rolling
    // migration an older response legitimately omits them, so retain the
    // schedule with zero-valued fallbacks instead of failing the whole page.
    order_batch_count: z.number().nonnegative().optional().default(0),
    case_count: z.number().nonnegative().optional().default(0),
  })).parse(customerOrders.data);
  const readableSupplierDeliveries = z.array(z.object({
    id: z.uuid(),
    supplier_name: z.string(),
    reference: z.string(),
    expected_on: z.iso.date(),
    note: z.string(),
    lines: z.array(z.object({
      ingredient_name: z.string(), quantity: z.number(), uom: z.string(),
    })),
  })).parse(supplierDeliveries.data);
  const readableLabels = new Map(readableBatchContext.map((task) => [`${task.type}:${task.id}`, task]));
  return {
    ...schedule,
    linked_tasks: [...schedule.linked_tasks, ...workContext].map((task) => readableLabels.get(`${task.type}:${task.id}`) ?? task),
    customer_product_ids: z.record(z.string(), z.array(z.uuid())).parse(customerProducts.data),
    customer_orders: readableCustomerOrders,
    supplier_deliveries: readableSupplierDeliveries,
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
  'PTO changed; reload and try again', 'Invalid linked task', 'Completed work cannot be moved',
  'Started or completed work cannot be deleted', 'Completed work dependencies cannot be changed',
  'Completed or cancelled work cannot be changed',
  'Generated work scope cannot be changed in the planner',
  'Generated work staffing must be changed through Work',
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
