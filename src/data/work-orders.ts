import 'server-only';

import type { supabase } from '@/lib/supabase';
import type {
  DeleteWorkOrder, MoveDependentWork, SetWorkOrderPredecessors,
} from '@/domain/work-orders';

type WorkOrderDb = Awaited<ReturnType<typeof supabase>>;

/** Read dependency edges through the caller's tenant- and facility-scoped session. */
export function readWorkOrderDependencies(
  db: WorkOrderDb,
  payload: { facility_id: string },
) {
  return db.rpc('get_work_order_dependencies', { payload });
}

/** Atomically replace the incoming dependency edges of one work order. */
export function writeWorkOrderPredecessors(db: WorkOrderDb, payload: SetWorkOrderPredecessors) {
  return db.rpc('set_work_order_predecessors', { payload });
}

/** Compatibility write for scheduler events pending migration to canonical Work. */
export function writeScheduleEventPredecessors(db: WorkOrderDb, payload: SetWorkOrderPredecessors) {
  return db.rpc('set_schedule_event_predecessors', { payload });
}

/** Audit-cancel a work order and atomically reconnect its neighboring edges. */
export function removeWorkOrder(db: WorkOrderDb, payload: DeleteWorkOrder) {
  return db.rpc('delete_work_order', { payload });
}

function movementPayload(payload: MoveDependentWork) {
  return {
    id: payload.id,
    revision: payload.revision,
    start_at: payload.start_at,
    end_at: payload.end_at,
  };
}

/** Move a canonical work order and its unfinished downstream dependency chain. */
export function moveWorkOrderChain(db: WorkOrderDb, payload: MoveDependentWork) {
  return db.rpc('move_scheduled_work_order', { payload: movementPayload(payload) });
}

/** Compatibility move for a schedule event and its downstream dependency chain. */
export function moveScheduleEventChain(db: WorkOrderDb, payload: MoveDependentWork) {
  return db.rpc('move_schedule_event_with_successors', { payload: movementPayload(payload) });
}
