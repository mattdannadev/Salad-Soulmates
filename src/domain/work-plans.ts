import { z } from 'zod';

/** Lifecycle states for a versioned, reusable operational workflow. */
export const workPlanVersionStates = ['draft', 'review', 'released', 'retired'] as const;
export const workPlanVersionStateSchema = z.enum(workPlanVersionStates);

/** A step either creates an accountable physical output or remains a task within one. */
export const workPlanMaterializationPolicies = ['work_order', 'task_only'] as const;
export const workPlanMaterializationPolicySchema = z.enum(workPlanMaterializationPolicies);

/** Validated read contract for the versioned Work Plan management workspace. */
export const workPlanVersionSummarySchema = z.object({
  id: z.uuid(),
  work_plan_id: z.uuid(),
  code: z.string(),
  name: z.string(),
  version_number: z.number().int().positive(),
  state: workPlanVersionStateSchema,
  revision: z.number().int().positive(),
  step_count: z.number().int().nonnegative(),
  steps: z.array(z.object({
    key: z.string(),
    title: z.string(),
    materialization_policy: workPlanMaterializationPolicySchema,
    requires_verification: z.boolean(),
    optional: z.boolean().default(false),
    instructions: z.string(),
  })),
  dependencies: z.array(z.object({ predecessor_key: z.string(), successor_key: z.string() })),
});

export const workPlanVersionsSchema = z.array(workPlanVersionSummarySchema);
export type WorkPlanVersionSummary = z.infer<typeof workPlanVersionSummarySchema>;

export const workPlanStepSchema = z.object({
  key: z.string().trim().min(1).max(80)
    .regex(/^[a-z][a-z0-9_]*$/),
  title: z.string().trim().min(1).max(120),
  materialization_policy: workPlanMaterializationPolicySchema,
  task_template: z.object({
    instructions: z.string().trim().max(2_000).default(''),
    requires_verification: z.boolean().default(false),
    optional: z.boolean().default(false),
  }).strict(),
}).strict();

export const workPlanStepDependencySchema = z.object({
  predecessor_key: z.string().trim().min(1).max(80),
  successor_key: z.string().trim().min(1).max(80),
}).strict().superRefine((value, context) => {
  if (value.predecessor_key === value.successor_key) {
    context.addIssue({ code: 'custom', message: 'A work-plan step cannot depend on itself.' });
  }
});

function containsDependencyCycle(
  stepKeys: ReadonlySet<string>,
  dependencies: readonly z.infer<typeof workPlanStepDependencySchema>[],
) {
  const successors = new Map<string, string[]>();
  stepKeys.forEach((key) => successors.set(key, []));
  dependencies.forEach(({ predecessor_key: predecessorKey, successor_key: successorKey }) => {
    successors.get(predecessorKey)?.push(successorKey);
  });

  const visiting = new Set<string>();
  const visited = new Set<string>();
  const visit = (key: string): boolean => {
    if (visiting.has(key)) return true;
    if (visited.has(key)) return false;
    visiting.add(key);
    const cyclic = (successors.get(key) ?? []).some(visit);
    visiting.delete(key);
    visited.add(key);
    return cyclic;
  };
  return [...stepKeys].some(visit);
}

/**
 * Validates the immutable content of a Work Plan version before it can enter
 * review or release. Dates, worker assignment, and quantity are intentionally
 * absent: they belong to Applied Plans and Work Packages.
 */
export const workPlanDefinitionSchema = z.object({
  name: z.string().trim().min(2).max(120),
  steps: z.array(workPlanStepSchema).min(1).max(100),
  dependencies: z.array(workPlanStepDependencySchema).max(500),
}).superRefine((value, context) => {
  const stepKeys = new Set(value.steps.map((step) => step.key));
  if (stepKeys.size !== value.steps.length) {
    context.addIssue({ code: 'custom', path: ['steps'], message: 'Each work-plan step needs a unique key.' });
  }

  const dependencyKeys = new Set<string>();
  value.dependencies.forEach((dependency, index) => {
    const edge = `${dependency.predecessor_key}:${dependency.successor_key}`;
    if (!stepKeys.has(dependency.predecessor_key) || !stepKeys.has(dependency.successor_key)) {
      context.addIssue({ code: 'custom', path: ['dependencies', index], message: 'Dependencies must reference plan steps.' });
    }
    if (dependencyKeys.has(edge)) {
      context.addIssue({ code: 'custom', path: ['dependencies', index], message: 'Each dependency may appear only once.' });
    }
    dependencyKeys.add(edge);
  });
  if (containsDependencyCycle(stepKeys, value.dependencies)) {
    context.addIssue({ code: 'custom', path: ['dependencies'], message: 'Work-plan dependencies cannot contain a cycle.' });
  }
});

/** Input for creating the first draft version of a reusable Work Plan. */
export const createWorkPlanSchema = workPlanDefinitionSchema.extend({
  code: z.string().trim().min(2).max(80)
    .regex(/^[a-z][a-z0-9_]*$/),
});

/** Replace the mutable definition of one draft/review version using optimistic revision control. */
export const saveWorkPlanDraftSchema = workPlanDefinitionSchema.extend({
  version_id: z.uuid(),
  revision: z.number().int().positive(),
});

/** Request contract for the one-way draft/review-to-released transition. */
export const releaseWorkPlanVersionSchema = z.object({
  version_id: z.uuid(),
  revision: z.number().int().positive(),
});

export const createWorkPlanDraftVersionSchema = z.object({
  work_plan_id: z.uuid(), request_id: z.uuid(),
}).strict();

/** Review requires return to draft before editing; retirement preserves release evidence. */
export const transitionWorkPlanVersionSchema = releaseWorkPlanVersionSchema.extend({
  state: z.enum(['draft', 'review', 'retired']),
}).strict();
export type TransitionWorkPlanVersion = z.input<typeof transitionWorkPlanVersionSchema>;

export type WorkPlanDefinition = z.input<typeof workPlanDefinitionSchema>;
export type CreateWorkPlan = z.input<typeof createWorkPlanSchema>;
export type SaveWorkPlanDraft = z.input<typeof saveWorkPlanDraftSchema>;
export type ReleaseWorkPlanVersion = z.input<typeof releaseWorkPlanVersionSchema>;
export type CreateWorkPlanDraftVersion = z.input<typeof createWorkPlanDraftVersionSchema>;
