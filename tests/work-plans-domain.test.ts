import { describe, expect, it } from 'vitest';
import { workPlanDefinitionSchema, createWorkPlanDraftVersionSchema, transitionWorkPlanVersionSchema } from '@/domain/work-plans';

const definition = {
  name: 'Standard production workflow',
  steps: [
    {
      key: 'prepare', title: 'Prepare', materialization_policy: 'work_order', task_template: {},
    },
    {
      key: 'mix', title: 'Mix', materialization_policy: 'work_order', task_template: {},
    },
    {
      key: 'verify',
      title: 'Verify',
      materialization_policy: 'task_only',
      task_template: { requires_verification: true },
    },
  ],
  dependencies: [
    { predecessor_key: 'prepare', successor_key: 'mix' },
    { predecessor_key: 'mix', successor_key: 'verify' },
  ],
};

describe('work-plan domain contract', () => {
  it('requires a valid operation token for clone recovery and restricts lifecycle requests', () => {
    const workPlanId = '10000000-0000-4000-8000-000000000001';
    expect(createWorkPlanDraftVersionSchema.safeParse({ work_plan_id: workPlanId }).success)
      .toBe(false);
    expect(createWorkPlanDraftVersionSchema.safeParse({
      work_plan_id: workPlanId, request_id: 'invalid',
    }).success).toBe(false);
    expect(createWorkPlanDraftVersionSchema.safeParse({
      work_plan_id: workPlanId, request_id: workPlanId,
    }).success).toBe(true);
    expect(transitionWorkPlanVersionSchema.safeParse({
      version_id: workPlanId, revision: 1, state: 'review',
    }).success).toBe(true);
    expect(transitionWorkPlanVersionSchema.safeParse({
      version_id: workPlanId, revision: 1, state: 'released',
    }).success).toBe(false);
  });
  it('keeps reusable workflow definition separate from planning and execution facts', () => {
    const parsed = workPlanDefinitionSchema.parse(definition);
    const [firstStep] = parsed.steps;
    if (!firstStep) throw new Error('Expected a validated work-plan step.');
    expect(parsed.name).toBe('Standard production workflow');
    expect(firstStep.task_template).toEqual({
      instructions: '', requires_verification: false, optional: false,
    });
  });

  it('rejects cyclic, duplicate, or dangling dependency graphs', () => {
    expect(workPlanDefinitionSchema.safeParse({
      ...definition,
      dependencies: [...definition.dependencies, { predecessor_key: 'verify', successor_key: 'prepare' }],
    }).success).toBe(false);
    expect(workPlanDefinitionSchema.safeParse({
      ...definition,
      dependencies: [...definition.dependencies, definition.dependencies[0]],
    }).success).toBe(false);
    expect(workPlanDefinitionSchema.safeParse({
      ...definition,
      dependencies: [{ predecessor_key: 'prepare', successor_key: 'missing' }],
    }).success).toBe(false);
  });
});
