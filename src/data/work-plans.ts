import 'server-only';

import type {
  CreateWorkPlan, CreateWorkPlanDraftVersion, ReleaseWorkPlanVersion,
  SaveWorkPlanDraft, TransitionWorkPlanVersion,
} from '@/domain/work-plans';
import type { supabase } from '@/lib/supabase';

type WorkPlanDb = Awaited<ReturnType<typeof supabase>>;

/** Read Work Plan versions through the caller's authenticated, RLS-scoped client. */
export function listWorkPlanVersionRecords(db: WorkPlanDb) {
  return db.rpc('list_work_plan_versions');
}

/** Commit a fully validated draft Work Plan version as immutable master data. */
export default function releaseWorkPlanVersionRecord(
  db: WorkPlanDb,
  payload: ReleaseWorkPlanVersion,
) {
  return db.rpc('release_work_plan_version', { payload });
}

/** Persist one complete draft workflow definition in a single transaction. */
export function createWorkPlanRecord(db: WorkPlanDb, payload: CreateWorkPlan) {
  return db.rpc('create_work_plan', { payload });
}

/** Replace draft-only steps and dependencies in one transaction. */
export function saveWorkPlanDraftRecord(db: WorkPlanDb, payload: SaveWorkPlanDraft) {
  return db.rpc('save_work_plan_draft', { payload });
}

export function createWorkPlanDraftVersionRecord(
  db: WorkPlanDb,
  payload: CreateWorkPlanDraftVersion,
) {
  return db.rpc('create_work_plan_draft_version', { payload });
}

export function transitionWorkPlanVersionRecord(
  db: WorkPlanDb,
  payload: TransitionWorkPlanVersion,
) {
  return db.rpc('transition_work_plan_version', { payload });
}
