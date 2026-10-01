import 'server-only';

import type { supabase } from '@/lib/supabase';

type ScheduleDb = Awaited<ReturnType<typeof supabase>>;

export type ScheduleMutation = 'save_workforce_schedule_event' | 'delete_workforce_schedule_event'
  | 'save_facility_schedule_settings' | 'publish_workforce_schedule'
  | 'save_workforce_pto' | 'cancel_workforce_pto' | 'save_workforce_availability'
  | 'save_workforce_pto_type' | 'retire_workforce_pto_type';

/** All scheduling reads and writes use the caller's scoped database session. */
export function readFacilitySchedule(db: ScheduleDb, payload: {
  facility_id: string; start_on: string; end_on: string;
}) {
  return db.rpc('get_workforce_schedule', { payload });
}

export function readMySchedule(db: ScheduleDb, payload: {
  start_on: string; end_on: string;
}) {
  return db.rpc('get_my_workforce_schedule', { payload });
}

export function readWorkQueueContext(db: ScheduleDb, payload: {
  facility_id: string; start_on: string; end_on: string;
}) {
  return db.rpc('get_workforce_work_context', { payload });
}

export function writeSchedule(db: ScheduleDb, operation: ScheduleMutation, payload: {
  facility_id: string;
}) {
  return db.rpc(operation as never, { payload } as never);
}
