'use client';

import {
  useCallback, useEffect, useRef, useState, useTransition,
} from 'react';
import { z } from 'zod';
import {
  createWorkPlanAction, releaseWorkPlanVersionAction, saveWorkPlanDraftAction,
  createWorkPlanDraftVersionAction,
  transitionWorkPlanVersionAction,
} from '@/app/app/settings/work-plans/actions';
import ListGrid, { type ListGridColumn, type ListGridRow } from '@/components/list-grid';
import ActionButton from '@/components/action-button';
import ConfirmDialog from '@/components/confirm-dialog';
import styles from '@/components/work-plan-manager.module.css';
import { workPlanActionMessage, workPlanCopy } from '@/components/work-plan-copy';
import {
  compareWorkPlanVersions, previousReleasedWorkPlanVersion,
  visibleWorkPlanDefinition, workPlanCloneStorageKey,
  workPlanSaveIdentity,
} from '@/components/work-plan-presentation';
import type { ActionResult } from '@/domain/master-data';
import type { WorkPlanVersionSummary } from '@/domain/work-plans';
import { logFailure } from '@/lib/operation-error';

export type { WorkPlanVersionSummary } from '@/domain/work-plans';

interface WorkPlanStep {
  key: string;
  title: string;
  materialization_policy: 'work_order' | 'task_only';
  requires_verification: boolean;
  optional: boolean;
  instructions: string;
}

interface DependencySelection {
  predecessor_key: string;
  successor_key: string;
}

const workPlanColumns: ListGridColumn[] = [
  {
    key: 'name', label: 'Work Plan', minWidth: 165, flex: 2,
  },
  {
    key: 'action', label: 'Action', minWidth: 105, sortable: false,
  },
];

function formString(data: FormData, key: string) {
  const value = data.get(key);
  return typeof value === 'string' ? value : '';
}

export default function WorkPlanManager({ versions, locale = 'en', actorId }: {
  versions: WorkPlanVersionSummary[];
  actorId: string;
  locale?: 'en' | 'es';
}) {
  const copy = (text: string) => workPlanCopy(locale, text);
  const localizedPlanColumns = workPlanColumns.map((column) => ({
    ...column, label: copy(column.label),
  }));
  const [pending, startTransition] = useTransition();
  const cloneRequests = useRef<Record<string, string>>({});
  const [message, setMessage] = useState('');
  const [feedbackKind, setFeedbackKind] = useState<'success' | 'error'>('success');
  const [showCreate, setShowCreate] = useState(false);
  const [selectedVersionId, setSelectedVersionId] = useState<string | null>(null);
  const [lastVersionId, setLastVersionId] = useState<string | undefined>();
  const [selectedSteps, setSelectedSteps] = useState<Record<string, string>>({});
  const [retiringVersion, setRetiringVersion] = useState<WorkPlanVersionSummary | null>(null);
  const editorHeading = useRef<HTMLHeadingElement>(null);
  const stepEditor = useRef<HTMLFieldSetElement>(null);
  const directory = useRef<HTMLDivElement>(null);
  const retirementFocus = useRef<string | null>(null);
  const [draftSteps, setDraftSteps] = useState<Record<string, WorkPlanStep[]>>({});
  const [draftNames, setDraftNames] = useState<Record<string, string>>({});
  const [draftRevisions, setDraftRevisions] = useState<Record<string, number>>({});
  const [draftDependencies, setDraftDependencies] = useState<Record<string, WorkPlanVersionSummary['dependencies']>>({});
  const [dependencySelections, setDependencySelections] = useState<
    Record<string, DependencySelection>
  >({});
  const rows: ListGridRow[] = versions.map((version) => ({
    id: version.id,
    cells: {
      name: {
        text: version.name,
        secondary: `${version.code} · ${copy('Version')} ${version.version_number} · ${copy(version.state)}`,
        sortValue: version.name,
      },
      version: { text: `${copy('Version')} ${version.version_number}`, sortValue: version.version_number },
      steps: { text: String(version.step_count), sortValue: version.step_count },
      state: {
        text: copy(version.state),
        badge: version.state === 'released' ? 'default' : 'muted',
        sortValue: version.state,
      },
      action: { text: copy('Open version'), slot: version.id },
    },
  }));

  useEffect(() => {
    if (selectedVersionId) editorHeading.current?.focus();
  }, [selectedVersionId]);

  function openVersion(versionId: string) {
    setShowCreate(false);
    setSelectedVersionId(versionId);
    setLastVersionId(versionId);
  }

  const returnToDirectory = useCallback(() => {
    setSelectedVersionId(null);
    requestAnimationFrame(() => {
      const target = document.getElementById(`open-version-${lastVersionId}`)
        ?? directory.current?.querySelector('input');
      if (target instanceof HTMLElement) target.focus();
    });
  }, [lastVersionId]);

  useEffect(() => {
    if (!selectedVersionId) return undefined;
    const onEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape' && !event.defaultPrevented && !pending && !retiringVersion) {
        event.preventDefault();
        returnToDirectory();
      }
    };
    window.addEventListener('keydown', onEscape);
    return () => window.removeEventListener('keydown', onEscape);
  }, [selectedVersionId, pending, retiringVersion, returnToDirectory]);

  useEffect(() => {
    if (pending || !retirementFocus.current) return;
    const opener = document.getElementById(retirementFocus.current);
    retirementFocus.current = null;
    if (opener instanceof HTMLButtonElement && !opener.disabled) opener.focus();
    else editorHeading.current?.focus();
  }, [pending, retiringVersion]);

  function runAction(
    operation: string,
    action: () => Promise<ActionResult>,
    onSuccess?: (result: ActionResult) => void,
    onSettled?: () => void,
  ) {
    startTransition(async () => {
      try {
        const result = await action();
        setMessage(workPlanActionMessage(locale, result.message));
        setFeedbackKind(result.ok ? 'success' : 'error');
        if (result.ok) onSuccess?.(result);
      } catch (error) {
        logFailure(operation, error);
        setMessage(copy('Connection interrupted. Reload before retrying.'));
        setFeedbackKind('error');
      } finally {
        onSettled?.();
      }
    });
  }

  function createPlan(form: HTMLFormElement) {
    const data = new FormData(form);
    runAction('work_plan_create_action', () => createWorkPlanAction({
      code: data.get('code'),
      name: data.get('name'),
      steps: [{
        key: 'complete', title: copy('Complete work'), materialization_policy: 'work_order', task_template: {},
      }],
      dependencies: [],
    }), (result) => {
      form.reset();
      setShowCreate(false);
      if (result.id) openVersion(result.id);
    });
  }

  function releaseVersion(version: WorkPlanVersionSummary) {
    runAction('work_plan_release_action', () => releaseWorkPlanVersionAction({
      version_id: version.id,
      revision: version.revision,
    }));
  }

  function createNewVersion(version: WorkPlanVersionSummary) {
    const storageKey = workPlanCloneStorageKey(actorId, version.work_plan_id);
    let storedRequestId: string | undefined;
    try {
      const stored = z.uuid().safeParse(sessionStorage.getItem(storageKey));
      if (stored.success) storedRequestId = stored.data;
    } catch (error) {
      logFailure('work_plan_clone_token_read', error);
    }
    const requestId = cloneRequests.current[storageKey]
      ?? storedRequestId ?? crypto.randomUUID();
    cloneRequests.current[storageKey] = requestId;
    try {
      sessionStorage.setItem(storageKey, requestId);
    } catch (error) {
      logFailure('work_plan_clone_token_write', error);
    }
    runAction('work_plan_clone_action', () => createWorkPlanDraftVersionAction({
      work_plan_id: version.work_plan_id,
      request_id: requestId,
    }), (result) => {
      delete cloneRequests.current[storageKey];
      if (result.id) openVersion(result.id);
      try {
        sessionStorage.removeItem(storageKey);
      } catch (error) {
        logFailure('work_plan_clone_token_clear', error);
      }
    });
  }

  function changeLifecycle(version: WorkPlanVersionSummary, state: 'draft' | 'review' | 'retired') {
    runAction('work_plan_lifecycle_action', () => transitionWorkPlanVersionAction({
      version_id: version.id, revision: version.revision, state,
    }), undefined, state === 'retired' ? () => {
      retirementFocus.current = `retire-version-${version.id}`;
      setRetiringVersion(null);
    } : undefined);
  }

  function saveSteps(
    version: WorkPlanVersionSummary,
    steps: WorkPlanStep[],
    dependencies: WorkPlanVersionSummary['dependencies'],
    form: HTMLFormElement,
  ) {
    const missingTitle = steps.find((step) => !step.title.trim());
    if (missingTitle) {
      setSelectedSteps((current) => ({ ...current, [version.id]: missingTitle.key }));
      setMessage(copy('Complete the step title before moving to another step.'));
      setFeedbackKind('error');
      requestAnimationFrame(() => {
        const title = stepEditor.current?.querySelector('input[name^="title-"]');
        if (title instanceof HTMLInputElement) {
          title.setCustomValidity(copy('Enter a step title.'));
          title.reportValidity();
        }
      });
      return;
    }
    const data = new FormData(form);
    const savedSteps = steps.map((step) => ({
      key: step.key,
      title: step.title,
      materialization_policy: step.materialization_policy,
      task_template: {
        instructions: step.instructions,
        requires_verification: step.requires_verification,
        optional: step.optional,
      },
    }));
    runAction('work_plan_save_action', () => saveWorkPlanDraftAction({
      ...workPlanSaveIdentity(version, draftRevisions[version.id]),
      name: formString(data, 'name'),
      steps: savedSteps,
      dependencies,
    }), () => {
      setDraftRevisions((current) => {
        const next = { ...current };
        delete next[version.id];
        return next;
      });
      setDraftSteps((current) => {
        const next = { ...current };
        delete next[version.id];
        return next;
      });
      setDraftDependencies((current) => {
        const next = { ...current };
        delete next[version.id];
        return next;
      });
      setDraftNames((current) => {
        const next = { ...current };
        delete next[version.id];
        return next;
      });
    });
  }

  function captureEditRevision(version: WorkPlanVersionSummary) {
    setDraftRevisions((current) => ({
      ...current, [version.id]: current[version.id] ?? version.revision,
    }));
  }

  function validateCurrentStep() {
    const title = stepEditor.current?.querySelector('input[name^="title-"]');
    if (title instanceof HTMLInputElement) {
      title.setCustomValidity(title.value.trim() ? '' : copy('Enter a step title.'));
    }
    const invalid = stepEditor.current?.querySelector(':invalid');
    if (invalid instanceof HTMLInputElement || invalid instanceof HTMLTextAreaElement) {
      setMessage(copy('Complete the step title before moving to another step.'));
      setFeedbackKind('error');
      invalid.reportValidity();
      return false;
    }
    return true;
  }

  function chooseStep(versionId: string, stepKey: string) {
    if (!validateCurrentStep()) return;
    setSelectedSteps((current) => ({ ...current, [versionId]: stepKey }));
  }

  function addStep(version: WorkPlanVersionSummary) {
    if (!validateCurrentStep()) return;
    captureEditRevision(version);
    const current = draftSteps[version.id] ?? version.steps;
    let next = current.length + 1;
    const usedKeys = new Set(current.map((step) => step.key));
    while (usedKeys.has(`step_${next}`)) next += 1;
    const key = `step_${next}`;
    setSelectedSteps((currentSelections) => ({ ...currentSelections, [version.id]: key }));
    setDraftSteps({
      ...draftSteps,
      [version.id]: [...current, {
        key,
        title: `${copy('Step')} ${next}`,
        materialization_policy: 'task_only',
        requires_verification: false,
        optional: false,
        instructions: '',
      }],
    });
  }

  function updateStep(
    version: WorkPlanVersionSummary,
    key: string,
    changes: Partial<WorkPlanStep>,
  ) {
    captureEditRevision(version);
    setDraftSteps((current) => ({
      ...current,
      [version.id]: (current[version.id] ?? version.steps).map((step) => (
        step.key === key ? { ...step, ...changes } : step
      )),
    }));
  }

  function removeStep(version: WorkPlanVersionSummary, key: string) {
    const current = draftSteps[version.id] ?? version.steps;
    if (current.length <= 1) return;
    captureEditRevision(version);
    setDraftSteps({ ...draftSteps, [version.id]: current.filter((step) => step.key !== key) });
    const dependencies = draftDependencies[version.id] ?? version.dependencies;
    setDraftDependencies({
      ...draftDependencies,
      [version.id]: dependencies.filter(
        (edge) => edge.predecessor_key !== key && edge.successor_key !== key,
      ),
    });
  }

  function moveStep(version: WorkPlanVersionSummary, key: string, direction: -1 | 1) {
    const current = [...(draftSteps[version.id] ?? version.steps)];
    const index = current.findIndex((step) => step.key === key);
    const target = index + direction;
    if (index < 0 || target < 0 || target >= current.length) return;
    const source = current[index];
    const destination = current[target];
    if (!source || !destination) return;
    captureEditRevision(version);
    current[index] = destination;
    current[target] = source;
    setDraftSteps({ ...draftSteps, [version.id]: current });
  }

  function addDependency(version: WorkPlanVersionSummary, steps: WorkPlanStep[]) {
    const selection = dependencySelections[version.id];
    if (!selection || selection.predecessor_key === selection.successor_key
      || !steps.some((step) => step.key === selection.predecessor_key)
      || !steps.some((step) => step.key === selection.successor_key)) return;
    const dependencies = draftDependencies[version.id] ?? version.dependencies;
    if (dependencies.some((edge) => edge.predecessor_key === selection.predecessor_key
      && edge.successor_key === selection.successor_key)) return;
    captureEditRevision(version);
    setDraftDependencies({ ...draftDependencies, [version.id]: [...dependencies, selection] });
  }

  function removeDependency(version: WorkPlanVersionSummary, selection: DependencySelection) {
    captureEditRevision(version);
    const dependencies = draftDependencies[version.id] ?? version.dependencies;
    setDraftDependencies({
      ...draftDependencies,
      [version.id]: dependencies.filter((edge) => edge.predecessor_key !== selection.predecessor_key
        || edge.successor_key !== selection.successor_key),
    });
  }

  return (
    <section className={styles.workspace} aria-label={copy('Work Plans')}>
      <div hidden={selectedVersionId !== null}>
        <div className={styles.directoryHeader}>
          <div>
            <p className={styles.eyebrow}>{copy('WORKFLOW LIBRARY')}</p>
            <h2>{copy('Reusable Work Plans')}</h2>
            <p>
              {copy('Build a workflow once. Refine it safely with version history.')}
            </p>
          </div>
          <ActionButton disabled={pending} onClick={() => setShowCreate((visible) => !visible)}>
            {copy(showCreate ? 'Cancel' : 'Create Work Plan')}
          </ActionButton>
        </div>
        {showCreate ? (
          <form
            className={styles.createForm}
            onSubmit={(event) => {
              event.preventDefault();
              createPlan(event.currentTarget);
            }}
          >
            <div className={styles.createFields}>
              <label>
                {copy('Work Plan name')}
                <input name="name" disabled={pending} required minLength={2} maxLength={120} />
              </label>
              <div>
                <label htmlFor="work-plan-code">{copy('Stable code')}</label>
                <input
                  id="work-plan-code"
                  name="code"
                  aria-describedby="work-plan-code-help"
                  disabled={pending}
                  required
                  pattern="[a-z][a-z0-9_]{1,79}"
                  maxLength={80}
                />
                <small id="work-plan-code-help">
                  {copy('Lowercase letters, numbers, and underscores only. This cannot be changed later.')}
                </small>
              </div>
            </div>
            <p>
              {copy('Start with a name and a permanent code. Add your steps next.')}
            </p>
            <ActionButton type="submit" pending={pending} pendingLabel={copy('Creating…')}>{copy('Create draft')}</ActionButton>
          </form>
        ) : null}
      </div>
      {message && versions.find((version) => version.id === selectedVersionId)?.state !== 'draft' ? (
        <p role={feedbackKind === 'error' ? 'alert' : 'status'} className={styles.feedback}>{message}</p>
      ) : null}
      {versions.length ? (
        <>
          <div hidden={selectedVersionId !== null} className={styles.directoryGrid} ref={directory}>
            <ListGrid
              label={copy('Work Plan versions')}
              locale={locale}
              columns={localizedPlanColumns}
              rows={rows}
              pageSize={10}
              focusRowId={lastVersionId}
              cellSlots={Object.fromEntries(versions.map((version) => [
                version.id,
                <ActionButton
                  key={version.id}
                  id={`open-version-${version.id}`}
                  variant="tertiary"
                  disabled={pending}
                  aria-label={`${copy('Open version')} ${version.version_number} · ${version.name}`}
                  onClick={() => openVersion(version.id)}
                >
                  {copy('Open')}
                </ActionButton>,
              ]))}
              emptyMessage={copy('No Work Plans match the current view.')}
            />
          </div>
          <div className={styles.editorContainer}>
            {versions.filter((version) => version.id === selectedVersionId).map((version) => {
              const { steps, dependencies, name } = visibleWorkPlanDefinition(version, {
                steps: draftSteps[version.id],
                dependencies: draftDependencies[version.id],
                name: draftNames[version.id],
              });
              const activeStepKey = steps.some((step) => step.key === selectedSteps[version.id])
                ? selectedSteps[version.id] : steps[0]?.key;
              const stepRows: ListGridRow[] = steps.map((step) => ({
                id: step.key,
                cells: {
                  title: { text: step.title, secondary: step.key },
                  output: { text: copy(step.materialization_policy === 'work_order' ? 'Work Order' : 'Task only') },
                  verification: { text: copy(step.requires_verification ? 'Required' : 'Not required') },
                  optional: { text: copy(step.optional ? 'Optional' : 'Required') },
                  instructions: { text: step.instructions },
                  action: { text: copy('Edit step'), slot: step.key },
                },
              }));
              const stale = draftRevisions[version.id] !== undefined
                && draftRevisions[version.id] !== version.revision;
              const dirty = stale || name !== version.name
                || JSON.stringify(steps) !== JSON.stringify(version.steps)
                || JSON.stringify(dependencies) !== JSON.stringify(version.dependencies);
              const priorReleased = previousReleasedWorkPlanVersion(versions, version);
              const comparison = priorReleased
                ? compareWorkPlanVersions({
                  ...version, name, steps, dependencies,
                }, priorReleased) : null;
              return (
                <section
                  className={styles.editor}
                  aria-label={copy('Version editor')}
                  key={version.id}
                >

                  <div className={styles.editorNav}>
                    <ActionButton variant="tertiary" disabled={pending} onClick={() => returnToDirectory()}>
                      <span aria-hidden="true">←</span>
                      {copy('Back to Work Plans')}
                    </ActionButton>
                    <span>{`${version.code} / ${copy('Version')} ${version.version_number}`}</span>
                  </div>
                  <header className={styles.editorHeader}>
                    <div>
                      <p className={styles.eyebrow}>{copy('WORKFLOW DEFINITION')}</p>
                      <h2 ref={editorHeading} tabIndex={-1}>{version.name}</h2>
                      <p>{copy(version.state === 'draft' ? 'Shape the steps your team follows.' : 'A preserved workflow definition, ready for reference.')}</p>
                    </div>
                    <span className={version.state === 'released' ? styles.releasedBadge : styles.stateBadge}>{copy(version.state)}</span>
                  </header>

                  {stale ? (
                    <p role="status">{copy('Work Plan version changed; reload and try again.')}</p>
                  ) : null}
                  <div className={styles.lifecycleBar}>
                    <div>
                      <p>
                        {`${copy('Steps')}: ${version.step_count}`}
                      </p>
                    </div>
                    <div className={styles.lifecycleActions}>
                      {version.state === 'draft' || version.state === 'review' ? (
                        <ActionButton variant="secondary" disabled={pending || dirty} onClick={() => releaseVersion(version)}>
                          {copy('Release version')}
                        </ActionButton>
                      ) : null}
                      {version.state === 'released' ? (
                        <ActionButton variant="secondary" disabled={pending} onClick={() => createNewVersion(version)}>
                          {copy('Create new version')}
                        </ActionButton>
                      ) : null}
                      {version.state === 'draft' ? (
                        <ActionButton variant="secondary" disabled={pending || dirty} onClick={() => changeLifecycle(version, 'review')}>
                          {copy('Submit for review')}
                        </ActionButton>
                      ) : null}
                      {version.state === 'review' ? (
                        <ActionButton variant="secondary" disabled={pending} onClick={() => changeLifecycle(version, 'draft')}>
                          {copy('Return to draft')}
                        </ActionButton>
                      ) : null}
                      {version.state === 'released' ? (
                        <ActionButton
                          id={`retire-version-${version.id}`}
                          variant="secondary"
                          disabled={pending}
                          onClick={() => {
                            retirementFocus.current = null;
                            setMessage('');
                            setRetiringVersion(version);
                          }}
                        >
                          {copy('Retire version')}
                        </ActionButton>
                      ) : null}
                    </div>
                  </div>
                  {version.state === 'draft' ? (
                    <form
                      className={styles.editorForm}
                      onSubmit={(event) => {
                        event.preventDefault();
                        saveSteps(version, steps, dependencies, event.currentTarget);
                      }}
                    >
                      <label>
                        {copy('Work Plan name')}
                        <input
                          name="name"
                          disabled={pending}
                          value={name}
                          onChange={(event) => {
                            captureEditRevision(version);
                            setDraftNames({ ...draftNames, [version.id]: event.target.value });
                          }}
                          required
                          minLength={2}
                          maxLength={120}
                        />
                      </label>

                      <div className={styles.composer}>
                        <section className={styles.stepNavigator} aria-label={copy('Workflow steps')}>
                          <div className={styles.sectionHeader}>
                            <h3>{copy('Workflow steps')}</h3>
                            <ActionButton variant="tertiary" disabled={pending} onClick={() => addStep(version)}>{copy('Add step')}</ActionButton>
                          </div>
                          <ListGrid
                            label={`${version.name} · ${copy('Steps')}`}
                            locale={locale}
                            columns={[
                              {
                                key: 'title', label: copy('Step'), minWidth: 180, flex: 2, sortable: false,
                              },
                              {
                                key: 'action', label: copy('Action'), minWidth: 90, sortable: false,
                              },
                            ]}
                            focusRowId={activeStepKey}
                            cellSlots={Object.fromEntries(steps.map((step) => [
                              step.key,
                              <ActionButton
                                key={step.key}
                                variant="tertiary"
                                disabled={pending}
                                aria-pressed={activeStepKey === step.key}
                                aria-label={`${copy('Edit step')} · ${step.title}`}
                                onClick={() => chooseStep(version.id, step.key)}
                              >
                                {copy('Edit')}
                              </ActionButton>,
                            ]))}
                            rows={stepRows}
                            pageSize={10}
                            searchable={false}
                          />
                          <p className={styles.helper}>
                            {copy('Select a step to edit its instructions and output.')}
                          </p>
                        </section>
                        {steps.map((step, index) => (step.key === activeStepKey ? (
                          <fieldset
                            className={styles.stepForm}
                            key={step.key}
                            ref={stepEditor}
                            disabled={pending}
                          >
                            <legend>{`${copy('Step')} ${index + 1}`}</legend>
                            <div className={styles.stepFormHeader}>
                              <h3>{step.title}</h3>
                              <code>{step.key}</code>
                            </div>
                            <label>
                              {copy('Step title')}
                              <input
                                name={`title-${index}`}
                                value={step.title}
                                onChange={(event) => {
                                  event.currentTarget.setCustomValidity(event.target.value.trim() ? '' : copy('Enter a step title.'));
                                  updateStep(version, step.key, { title: event.target.value });
                                }}
                                required
                                maxLength={120}
                              />
                            </label>
                            <label>
                              {copy('Materializes')}
                              <select name={`policy-${index}`} value={step.materialization_policy} onChange={(event) => updateStep(version, step.key, { materialization_policy: event.target.value === 'work_order' ? 'work_order' : 'task_only' })}>
                                <option value="work_order">{copy('Work Order')}</option>
                                <option value="task_only">{copy('Task only')}</option>
                              </select>
                            </label>
                            <label className="check">
                              <span>{copy('Optional when applied')}</span>
                              <input
                                type="checkbox"
                                checked={step.optional}
                                onChange={(event) => updateStep(version, step.key, {
                                  optional: event.target.checked,
                                })}
                              />
                            </label>
                            <label className="check">
                              <span>{copy('Separate verification')}</span>
                              <input name={`verify-${index}`} type="checkbox" checked={step.requires_verification} onChange={(event) => updateStep(version, step.key, { requires_verification: event.target.checked })} />
                            </label>
                            <div>
                              <label htmlFor={`instructions-${version.id}-${step.key}`}>
                                {copy('Instructions')}
                              </label>
                              <textarea
                                id={`instructions-${version.id}-${step.key}`}
                                name={`instructions-${version.id}-${step.key}`}
                                value={step.instructions}
                                maxLength={2000}
                                disabled={pending}
                                onChange={(event) => updateStep(version, step.key, {
                                  instructions: event.target.value,
                                })}
                              />
                            </div>
                            <div className={styles.stepActions}>
                              <ActionButton variant="tertiary" disabled={pending || index === 0} onClick={() => moveStep(version, step.key, -1)}>
                                {copy('Move earlier')}
                              </ActionButton>
                              <ActionButton variant="tertiary" disabled={pending || index === steps.length - 1} onClick={() => moveStep(version, step.key, 1)}>
                                {copy('Move later')}
                              </ActionButton>
                              <ActionButton variant="tertiary" disabled={pending || steps.length <= 1} onClick={() => removeStep(version, step.key)}>
                                {copy('Remove step')}
                              </ActionButton>
                            </div>
                          </fieldset>
                        ) : null))}
                      </div>

                      <details className={styles.disclosure}>
                        <summary>
                          <strong>{copy('Step dependencies')}</strong>
                          <small>{copy('Define what must finish before another step starts.')}</small>
                          <span>{dependencies.length}</span>
                        </summary>
                        <div className={styles.disclosureBody}>
                          <fieldset className={styles.dependencyForm} disabled={pending}>
                            <legend>{copy('Step dependencies')}</legend>
                            <label>
                              {copy('Must finish first')}
                              <select
                                value={dependencySelections[version.id]?.predecessor_key ?? ''}
                                onChange={(event) => setDependencySelections({
                                  ...dependencySelections,
                                  [version.id]: {
                                    predecessor_key: event.target.value,
                                    successor_key: dependencySelections[version.id]?.successor_key ?? '',
                                  },
                                })}
                              >
                                <option value="">{copy('Choose a step')}</option>
                                {steps.map((step) => (
                                  <option key={step.key} value={step.key}>{step.title}</option>
                                ))}
                              </select>
                            </label>
                            <label>
                              {copy('Then enables')}
                              <select
                                value={dependencySelections[version.id]?.successor_key ?? ''}
                                onChange={(event) => setDependencySelections({
                                  ...dependencySelections,
                                  [version.id]: {
                                    predecessor_key: dependencySelections[version.id]?.predecessor_key ?? '',
                                    successor_key: event.target.value,
                                  },
                                })}
                              >
                                <option value="">{copy('Choose a step')}</option>
                                {steps.map((step) => (
                                  <option key={step.key} value={step.key}>{step.title}</option>
                                ))}
                              </select>
                            </label>
                            <ActionButton variant="secondary" onClick={() => addDependency(version, steps)}>
                              {copy('Add dependency')}
                            </ActionButton>
                          </fieldset>
                          {dependencies.length ? (
                            <ListGrid
                              label={`${version.name} · ${copy('Step dependencies')}`}
                              locale={locale}
                              columns={[
                                {
                                  key: 'dependency', label: copy('Dependency'), minWidth: 165, flex: 2,
                                },
                                { key: 'action', label: copy('Action'), minWidth: 105 },
                              ]}
                              rows={dependencies.map((dependency) => {
                                const key = `${dependency.predecessor_key}:${dependency.successor_key}`;
                                return {
                                  id: key,
                                  cells: {
                                    dependency: {
                                      text: [dependency.predecessor_key, dependency.successor_key]
                                        .map((stepKey) => steps.find((step) => step.key === stepKey)
                                          ?.title ?? stepKey)
                                        .join(' → '),
                                      secondary: `${dependency.predecessor_key} → ${dependency.successor_key}`,
                                    },
                                    action: { text: copy('Remove link'), slot: key },
                                  },
                                };
                              })}
                              cellSlots={Object.fromEntries(dependencies.map((dependency) => [
                                `${dependency.predecessor_key}:${dependency.successor_key}`,
                                <ActionButton
                                  key={`${dependency.predecessor_key}:${dependency.successor_key}`}
                                  variant="tertiary"
                                  disabled={pending}
                                  onClick={() => removeDependency(version, dependency)}
                                >
                                  {copy('Remove link')}
                                </ActionButton>,
                              ]))}
                              searchable={false}
                            />
                          ) : <p>{copy('No step dependencies yet. Steps may run in parallel.')}</p>}
                        </div>
                      </details>
                      {comparison && priorReleased ? (
                        <details className={styles.disclosure}>
                          <summary>
                            <strong>{copy('Version comparison')}</strong>
                            <small>{copy('Review changes from the previous released definition.')}</small>
                          </summary>
                          <section aria-label={copy('Version comparison')} className={styles.disclosureBody}>
                            <div>
                              <p className="eyebrow">
                                {copy('COMPARE WITH VERSION')}
                                {' '}
                                {priorReleased.version_number}
                              </p>
                              <h3>{copy('Draft changes')}</h3>
                              {comparison.nameChanged ? <p>{copy('Work Plan name changed.')}</p> : null}
                              <p>
                                {locale === 'en'
                                  ? `${comparison.addedDependencies.length} added and ${comparison.removedDependencies.length} removed dependencies.`
                                  : `${copy('Added dependencies')}: ${comparison.addedDependencies.length}. ${copy('Removed dependencies')}: ${comparison.removedDependencies.length}.`}
                              </p>
                              <p>
                                {`${copy('Added')}: ${comparison.added.length}. ${copy('Changed')}: ${comparison.changed.length}. ${copy('Removed')}: ${comparison.removed.length}.`}
                              </p>
                              {comparison.added.length || comparison.changed.length
                            || comparison.removed.length || comparison.addedDependencies.length
                            || comparison.removedDependencies.length ? (
                              <ListGrid
                                label={copy('Step changes')}
                                locale={locale}
                                columns={[
                                  { key: 'change', label: copy('Change') },
                                  { key: 'step', label: copy('Step') },
                                ]}
                                rows={[
                                  ...comparison.added.map((key) => ({
                                    id: `added-${key}`,
                                    cells: { change: { text: copy('Added') }, step: { text: key } },
                                  })),
                                  ...comparison.changed.map((key) => ({
                                    id: `changed-${key}`,
                                    cells: { change: { text: copy('Changed') }, step: { text: key } },
                                  })),
                                  ...comparison.removed.map((key) => ({
                                    id: `removed-${key}`,
                                    cells: { change: { text: copy('Removed') }, step: { text: key } },
                                  })),
                                  ...comparison.addedDependencies.map((key) => ({
                                    id: `added-edge-${key}`,
                                    cells: { change: { text: copy('Added dependency') }, step: { text: key } },
                                  })),
                                  ...comparison.removedDependencies.map((key) => ({
                                    id: `removed-edge-${key}`,
                                    cells: { change: { text: copy('Removed dependency') }, step: { text: key } },
                                  })),
                                ]}
                                searchable={false}
                              />
                                ) : <p>{copy('No step changes from the released version.')}</p>}
                            </div>
                          </section>
                        </details>
                      ) : null}
                      <div className={styles.saveFooter}>
                        <div>
                          <strong>{copy(dirty ? 'Unsaved changes' : 'All changes saved')}</strong>
                          <span>{copy('Save your draft before review or release.')}</span>
                          {message ? (
                            <p
                              role={feedbackKind === 'error' ? 'alert' : 'status'}
                              className={feedbackKind === 'error' ? styles.saveError : styles.saveSuccess}
                            >
                              {message}
                            </p>
                          ) : null}
                        </div>
                        <ActionButton type="submit" pending={pending} pendingLabel={copy('Saving…')}>{copy('Save draft changes')}</ActionButton>
                      </div>
                    </form>
                  ) : (
                    <section aria-label={`${version.name} · ${copy('Steps')}`}>
                      <p>{copy('This version is read-only.')}</p>
                      <ListGrid
                        label={`${version.name} · ${copy('Steps')}`}
                        locale={locale}
                        columns={[{
                          key: 'title', label: copy('Step'), minWidth: 220, flex: 1,
                        }]}
                        rows={steps.map((step) => ({
                          id: step.key, cells: { title: { text: step.title, slot: step.key } },
                        }))}
                        cellSlots={Object.fromEntries(steps.map((step) => [
                          step.key,
                          <div key={step.key} className={styles.evidenceStep}>
                            <strong>{step.title}</strong>
                            <p>
                              {copy(step.materialization_policy === 'work_order' ? 'Work Order' : 'Task only')}
                              {' · '}
                              {copy(step.optional ? 'Optional' : 'Required')}
                              {' · '}
                              {copy(step.requires_verification ? 'Separate verification' : 'Not required')}
                            </p>
                            {step.instructions ? <p>{step.instructions}</p> : null}
                          </div>,
                        ]))}
                        searchable={false}
                      />
                      {dependencies.length ? (
                        <ListGrid
                          label={`${version.name} · ${copy('Step dependencies')}`}
                          locale={locale}
                          columns={[{ key: 'dependency', label: copy('Dependency') }]}
                          rows={dependencies.map((dependency) => ({
                            id: `${dependency.predecessor_key}:${dependency.successor_key}`,
                            cells: {
                              dependency: {
                                text: `${dependency.predecessor_key} → ${dependency.successor_key}`,
                              },
                            },
                          }))}
                          searchable={false}
                        />
                      ) : <p>{copy('No step dependencies yet. Steps may run in parallel.')}</p>}
                    </section>
                  )}
                </section>
              );
            })}
          </div>
        </>
      ) : (
        <div className={styles.empty}>
          <h3>{copy('A clear workflow starts here')}</h3>
          <p>
            {copy('Create your first Work Plan, then define the steps your team follows.')}
          </p>
        </div>
      )}

      <ConfirmDialog
        open={retiringVersion !== null}
        title={copy('Retire this version?')}
        description={copy('The definition and release history will be preserved. This version will be marked retired.')}
        confirmLabel={copy('Retire version')}
        cancelLabel={copy('Cancel')}
        pending={pending}
        onCancel={() => setRetiringVersion(null)}
        onConfirm={() => {
          if (retiringVersion) changeLifecycle(retiringVersion, 'retired');
        }}
      />
    </section>
  );
}
