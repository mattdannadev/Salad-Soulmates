import type { supabase } from '@/lib/supabase';

type QueueDb = Awaited<ReturnType<typeof supabase>>;

export function readMyWorkQueue(db: QueueDb, payload: { start_on: string; end_on: string }) {
  return db.rpc('get_my_workforce_work_queue', { payload });
}

export function claimWorkQueueItem(db: QueueDb, payload: { id: string; revision: number }) {
  return db.rpc('claim_workforce_work_queue_item', { payload });
}

export function createWorkQueueItem(db: QueueDb, payload: Record<string, unknown>) {
  return db.rpc('create_workforce_work_queue_item', { payload: payload as never });
}

export function publishWorkQueue(db: QueueDb, payload: { facility_id: string; work_on: string }) {
  return db.rpc('publish_workforce_work_queue', { payload });
}
