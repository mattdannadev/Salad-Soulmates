import type { WorkPlanVersionSummary } from '@/domain/work-plans';

/** A refreshed read must never advance the revision that local edits were based on. */
export function workPlanSaveIdentity(version: WorkPlanVersionSummary, editRevision?: number) {
  return { version_id: version.id, revision: editRevision ?? version.revision };
}

/** Retirement does not remove released historical evidence from comparisons. */
export function previousReleasedWorkPlanVersion(
  versions: WorkPlanVersionSummary[],
  version: WorkPlanVersionSummary,
) {
  return versions.filter((candidate) => (
    candidate.work_plan_id === version.work_plan_id
    && (candidate.state === 'released' || candidate.state === 'retired')
    && candidate.version_number < version.version_number
  )).sort((left, right) => right.version_number - left.version_number)[0];
}

/** Compare template evidence, including application-time optionality. */
export function compareWorkPlanVersions(
  draft: WorkPlanVersionSummary,
  released: WorkPlanVersionSummary,
) {
  const draftSteps = new Map(draft.steps.map((step) => [step.key, step]));
  const releasedSteps = new Map(released.steps.map((step) => [step.key, step]));
  const added = [...draftSteps.keys()].filter((key) => !releasedSteps.has(key));
  const removed = [...releasedSteps.keys()].filter((key) => !draftSteps.has(key));
  const changed = [...draftSteps.keys()].filter((key) => {
    const current = draftSteps.get(key);
    const prior = releasedSteps.get(key);
    return prior && current && (current.title !== prior.title
      || current.materialization_policy !== prior.materialization_policy
      || current.requires_verification !== prior.requires_verification
      || current.optional !== prior.optional
      || current.instructions !== prior.instructions
      || draft.steps.findIndex((step) => step.key === key)
        !== released.steps.findIndex((step) => step.key === key));
  });
  const edgeKey = (edge: WorkPlanVersionSummary['dependencies'][number]) => (
    `${edge.predecessor_key} → ${edge.successor_key}`
  );
  const draftEdges = new Set(draft.dependencies.map(edgeKey));
  const releasedEdges = new Set(released.dependencies.map(edgeKey));
  return {
    added,
    removed,
    changed,
    nameChanged: draft.name !== released.name,
    addedDependencies: [...draftEdges].filter((key) => !releasedEdges.has(key)),
    removedDependencies: [...releasedEdges].filter((key) => !draftEdges.has(key)),
  };
}

/** Keep retry identity separate for accounts sharing the same browser tab. */
export function workPlanCloneStorageKey(actorId: string, planId: string) {
  return `work-plan-clone:${actorId}:${planId}`;
}

/** Local edits cannot replace persisted evidence once a version leaves draft. */
export function visibleWorkPlanDefinition(
  version: WorkPlanVersionSummary,
  local: Partial<Pick<WorkPlanVersionSummary, 'name' | 'steps' | 'dependencies'>>,
) {
  return version.state === 'draft' ? {
    name: local.name ?? version.name,
    steps: local.steps ?? version.steps,
    dependencies: local.dependencies ?? version.dependencies,
  } : { name: version.name, steps: version.steps, dependencies: version.dependencies };
}
