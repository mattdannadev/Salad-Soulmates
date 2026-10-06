import { describe, expect, it } from 'vitest';
import {
  compareWorkPlanVersions, previousReleasedWorkPlanVersion,
  visibleWorkPlanDefinition, workPlanCloneStorageKey,
  workPlanSaveIdentity,
} from '@/components/work-plan-presentation';
import type { WorkPlanVersionSummary } from '@/domain/work-plans';

const version: WorkPlanVersionSummary = {
  id: '10000000-0000-4000-8000-000000000001',
  work_plan_id: '10000000-0000-4000-8000-000000000002',
  code: 'workflow',
  name: 'Saved workflow',
  version_number: 1,
  revision: 1,
  state: 'draft',
  step_count: 1,
  steps: [{
    key: 'complete',
    title: 'Saved step',
    materialization_policy: 'work_order',
    instructions: 'Saved instructions',
    requires_verification: false,
    optional: false,
  }],
  dependencies: [],
};
const local = {
  name: 'Unsaved workflow',
  steps: [{
    ...version.steps[0],
    key: 'unsaved',
    title: 'Unsaved step',
    materialization_policy: 'task_only' as const,
    instructions: 'Unsaved instructions',
    requires_verification: true,
    optional: true,
  }],
  dependencies: [{ predecessor_key: 'unsaved', successor_key: 'other' }],
};

describe('Work Plan presentation evidence and retries', () => {
  it('retains the edit revision after remote refresh rather than rebasing a stale save', () => {
    const identity = workPlanSaveIdentity({ ...version, revision: 2 }, 1);
    expect(identity).toEqual({ version_id: version.id, revision: 1 });
    expect(workPlanSaveIdentity({ ...version, revision: 2 })).toEqual({
      version_id: version.id, revision: 2,
    });
  });
  it('compares against the latest preceding release even after retirement', () => {
    const prior: WorkPlanVersionSummary = { ...version, state: 'retired', version_number: 2 };
    const current = { ...version, version_number: 3 };
    expect(previousReleasedWorkPlanVersion([
      { ...version, state: 'released' }, prior, current,
    ], current)).toEqual(prior);
  });
  it('comparison identifies changing only application-time optionality', () => {
    const draft = { ...version, steps: version.steps.map((step) => ({ ...step, optional: true })) };
    expect(compareWorkPlanVersions(draft, version)).toMatchObject({
      changed: ['complete'], added: [], removed: [], nameChanged: false,
    });
  });
  it('shows local edits only while draft and persisted evidence after remote lifecycle changes', () => {
    expect(visibleWorkPlanDefinition(version, local)).toEqual(local);
    (['review', 'released', 'retired'] as const).forEach((state) => {
      expect(visibleWorkPlanDefinition({ ...version, state }, local)).toEqual({
        name: version.name, steps: version.steps, dependencies: version.dependencies,
      });
    });
  });

  it('account switching cannot recover another actor lost-response token', () => {
    const firstActorKey = workPlanCloneStorageKey('first-actor', version.work_plan_id);
    const secondActorKey = workPlanCloneStorageKey('second-actor', version.work_plan_id);
    const storage = new Map([[firstActorKey, 'first-actor-request-token']]);
    expect(storage.get(firstActorKey)).toBe('first-actor-request-token');
    expect(storage.get(secondActorKey)).toBeUndefined();
    expect(workPlanCloneStorageKey('first-actor', version.work_plan_id)).toBe(firstActorKey);
  });
});
