'use client';

import {
  useId, useMemo, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import saveWorkType from '@/app/work-type-actions';
import ActionButton from '@/components/action-button';
import type { WorkType } from '@/domain/process-profiles';
import { workOrderQueueKinds } from '@/domain/process-profiles';
import styles from './work-type-manager.module.css';

type Locale = 'en' | 'es';
type QueueKind = WorkType['work_order_types'][number]['queue_kind'];

interface DraftStep {
  key: string;
  code: string;
  name: string;
  queueKind: QueueKind;
}

interface DraftWorkType {
  id: string;
  revision: number;
  code: string;
  name: string;
  description: string;
  active: boolean;
  steps: DraftStep[];
}

const copy = {
  en: {
    title: 'Work Types',
    introduction: 'Create a reusable flow, then assign it to any recipes that follow it.',
    newType: 'New Work Type',
    empty: 'No Work Types yet. Create the first flow your team follows.',
    active: 'Active',
    inactive: 'Inactive',
    name: 'Work Type name',
    namePlaceholder: 'For example, Cold mixing',
    purpose: 'Purpose',
    purposePlaceholder: 'A short explanation of when this flow should be used',
    available: 'Available for new process profiles',
    flow: 'Work orders in this flow',
    flowHelp: 'Put these in the order the team completes them.',
    addStep: 'Add work order',
    stepName: 'Work order name',
    stepPlaceholder: 'For example, Sanitize mixer',
    type: 'Type',
    moveUp: 'Move up',
    moveDown: 'Move down',
    remove: 'Remove',
    save: 'Save Work Type',
    saving: 'Saving…',
    saved: 'Work Type saved.',
    required: 'Add a name and complete every work order before saving.',
    connectionError: 'Unable to connect. Try saving again.',
    readOnly: 'You can view Work Types, but you do not have permission to change them.',
    unsaved: 'New',
  },
  es: {
    title: 'Tipos de trabajo',
    introduction: 'Cree un flujo reutilizable y asígnelo a cualquier receta que lo siga.',
    newType: 'Nuevo tipo de trabajo',
    empty: 'Aún no hay tipos de trabajo. Cree el primer flujo que sigue su equipo.',
    active: 'Activo',
    inactive: 'Inactivo',
    name: 'Nombre del tipo de trabajo',
    namePlaceholder: 'Por ejemplo, Mezclado en frío',
    purpose: 'Propósito',
    purposePlaceholder: 'Una explicación breve de cuándo usar este flujo',
    available: 'Disponible para nuevos perfiles de proceso',
    flow: 'Órdenes de trabajo en este flujo',
    flowHelp: 'Ordénelas como el equipo las completa.',
    addStep: 'Agregar orden de trabajo',
    stepName: 'Nombre de la orden de trabajo',
    stepPlaceholder: 'Por ejemplo, Desinfectar mezcladora',
    type: 'Tipo',
    moveUp: 'Subir',
    moveDown: 'Bajar',
    remove: 'Eliminar',
    save: 'Guardar tipo de trabajo',
    saving: 'Guardando…',
    saved: 'Tipo de trabajo guardado.',
    required: 'Agregue un nombre y complete cada orden de trabajo antes de guardar.',
    connectionError: 'No se pudo conectar. Intente guardar de nuevo.',
    readOnly: 'Puede ver los tipos de trabajo, pero no tiene permiso para cambiarlos.',
    unsaved: 'Nuevo',
  },
} as const;

const queueLabels: Record<QueueKind, Record<Locale, string>> = {
  pre_op: { en: 'Pre-Op', es: 'Preoperación' },
  post_op: { en: 'Post-Op', es: 'Postoperación' },
  ingredient_prep: { en: 'Ingredient Prep', es: 'Preparación de ingredientes' },
  mixing: { en: 'Mixing', es: 'Mezclado' },
  shipment_loading: { en: 'Loading', es: 'Carga' },
  receiving: { en: 'Receiving', es: 'Recepción' },
  packaging: { en: 'Packaging', es: 'Empaque' },
  maintenance: { en: 'Maintenance', es: 'Mantenimiento' },
  cleaning: { en: 'Cleaning', es: 'Limpieza' },
  other: { en: 'Other', es: 'Otro' },
};

function toDraft(workType: WorkType): DraftWorkType {
  return {
    id: workType.id,
    revision: workType.revision,
    code: workType.code,
    name: workType.name,
    description: workType.description,
    active: workType.active,
    steps: [...workType.work_order_types]
      .sort((left, right) => left.sequence - right.sequence)
      .map((step) => ({
        key: step.id,
        code: step.code,
        name: step.name,
        queueKind: step.queue_kind,
      })),
  };
}

function newDraft(): DraftWorkType {
  return {
    id: crypto.randomUUID(),
    revision: 0,
    code: '',
    name: '',
    description: '',
    active: true,
    steps: [{
      key: crypto.randomUUID(), code: '', name: '', queueKind: 'pre_op',
    }],
  };
}

function codeFromName(name: string, fallback: string) {
  const normalized = name.normalize('NFKD').replace(/[\u0300-\u036f]/g, '')
    .toLowerCase().replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '');
  const safe = /^[a-z]/.test(normalized) ? normalized : `${fallback}_${normalized}`;
  return (safe.length >= 2 ? safe : fallback).slice(0, 80);
}

function uniqueStepCodes(steps: DraftStep[]) {
  const used = new Set<string>();
  return steps.map((step, index) => {
    const base = step.code || codeFromName(step.name, `step_${index + 1}`);
    let code = base;
    let suffix = 2;
    while (used.has(code)) {
      const suffixText = `_${suffix}`;
      code = `${base.slice(0, 80 - suffixText.length)}${suffixText}`;
      suffix += 1;
    }
    used.add(code);
    return code;
  });
}

export interface WorkTypeManagerProps {
  initialWorkTypes: WorkType[];
  locale: Locale;
  canWrite: boolean;
}

/** A simple setup editor for reusable, ordered Work Type flows. */
export default function WorkTypeManager({
  initialWorkTypes,
  locale,
  canWrite,
}: WorkTypeManagerProps) {
  const formId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [drafts, setDrafts] = useState(() => initialWorkTypes.map(toDraft));
  const [selectedId, setSelectedId] = useState(initialWorkTypes[0]?.id ?? '');
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string }>();
  const selected = drafts.find((draft) => draft.id === selectedId);
  const text = copy[locale];
  const sortedDrafts = useMemo(
    () => [...drafts].sort((left, right) => left.name.localeCompare(right.name)),
    [drafts],
  );

  function updateSelected(update: (draft: DraftWorkType) => DraftWorkType) {
    setDrafts((current) => current.map((draft) => (
      draft.id === selectedId ? update(draft) : draft
    )));
    setFeedback(undefined);
  }

  function addWorkType() {
    const draft = newDraft();
    setDrafts((current) => [...current, draft]);
    setSelectedId(draft.id);
    setFeedback(undefined);
  }

  function moveStep(index: number, direction: -1 | 1) {
    updateSelected((draft) => {
      const destination = index + direction;
      if (destination < 0 || destination >= draft.steps.length) return draft;
      const steps = [...draft.steps];
      const current = steps[index];
      const adjacent = steps[destination];
      if (!current || !adjacent) return draft;
      steps[index] = adjacent;
      steps[destination] = current;
      return { ...draft, steps };
    });
  }

  function submit() {
    if (!selected || pending || !canWrite) return;
    const valid = selected.name.trim().length >= 2
      && selected.steps.length > 0
      && selected.steps.every((step) => step.name.trim().length >= 2);
    if (!valid) {
      setFeedback({ kind: 'error', message: text.required });
      return;
    }

    const stepCodes = uniqueStepCodes(selected.steps);
    startTransition(async () => {
      try {
        const workTypeCode = selected.code || [
          codeFromName(selected.name, 'work_type').slice(0, 70),
          selected.id.slice(0, 8),
        ].join('_');
        const result = await saveWorkType({
          id: selected.id,
          expected_revision: selected.revision,
          code: workTypeCode,
          name: selected.name,
          description: selected.description,
          active: selected.active,
          work_order_types: selected.steps.map((step, index) => ({
            code: stepCodes[index],
            name: step.name,
            queue_kind: step.queueKind,
          })),
        });
        setFeedback({
          kind: result.ok ? 'success' : 'error',
          message: result.ok ? text.saved : result.message,
        });
        if (result.ok) {
          setDrafts((current) => current.map((draft) => (draft.id === selected.id ? {
            ...draft,
            revision: draft.revision + 1,
            code: workTypeCode,
            steps: draft.steps.map((step, index) => ({ ...step, code: stepCodes[index] ?? '' })),
          } : draft)));
          router.refresh();
        }
      } catch {
        setFeedback({ kind: 'error', message: text.connectionError });
      }
    });
  }

  return (
    <section className={styles.manager} aria-labelledby={`${formId}-title`}>
      <header className={styles.header}>
        <div>
          <h2 id={`${formId}-title`}>{text.title}</h2>
          <p>{text.introduction}</p>
        </div>
        {canWrite ? (
          <ActionButton type="button" variant="secondary" onClick={() => addWorkType()}>
            {text.newType}
          </ActionButton>
        ) : null}
      </header>

      <div className={styles.workspace}>
        <nav className={styles.directory} aria-label={text.title}>
          {sortedDrafts.length === 0 ? <p className={styles.empty}>{text.empty}</p> : null}
          {sortedDrafts.map((draft) => (
            <button
              key={draft.id}
              type="button"
              className={draft.id === selectedId ? styles.selectedType : styles.typeButton}
              aria-current={draft.id === selectedId ? 'true' : undefined}
              onClick={() => {
                setSelectedId(draft.id);
                setFeedback(undefined);
              }}
            >
              <span>{draft.name || text.unsaved}</span>
              <small>{draft.active ? text.active : text.inactive}</small>
            </button>
          ))}
        </nav>

        {selected ? (
          <form
            className={styles.editor}
            onSubmit={(event) => {
              event.preventDefault();
              submit();
            }}
          >
            <div className={styles.basics}>
              <label htmlFor={`${formId}-name`}>
                {text.name}
                <input
                  id={`${formId}-name`}
                  value={selected.name}
                  disabled={!canWrite || pending}
                  maxLength={120}
                  placeholder={text.namePlaceholder}
                  onChange={(event) => updateSelected((draft) => ({
                    ...draft, name: event.currentTarget.value,
                  }))}
                  required
                />
              </label>
              <label htmlFor={`${formId}-description`}>
                {text.purpose}
                <textarea
                  id={`${formId}-description`}
                  value={selected.description}
                  disabled={!canWrite || pending}
                  maxLength={1000}
                  placeholder={text.purposePlaceholder}
                  onChange={(event) => updateSelected((draft) => ({
                    ...draft, description: event.currentTarget.value,
                  }))}
                />
              </label>
              <label className={styles.activeToggle}>
                <input
                  type="checkbox"
                  checked={selected.active}
                  disabled={!canWrite || pending}
                  onChange={(event) => updateSelected((draft) => ({
                    ...draft, active: event.currentTarget.checked,
                  }))}
                />
                <span>{text.available}</span>
              </label>
            </div>

            <div className={styles.flowHeader}>
              <div>
                <h3>{text.flow}</h3>
                <p>{text.flowHelp}</p>
              </div>
              {canWrite && selected.steps.length < 20 ? (
                <ActionButton
                  type="button"
                  variant="tertiary"
                  onClick={() => updateSelected((draft) => ({
                    ...draft,
                    steps: [...draft.steps, {
                      key: crypto.randomUUID(), code: '', name: '', queueKind: 'other',
                    }],
                  }))}
                >
                  {text.addStep}
                </ActionButton>
              ) : null}
            </div>

            <ol className={styles.steps}>
              {selected.steps.map((step, index) => (
                <li key={step.key} className={styles.step}>
                  <span className={styles.number}>{index + 1}</span>
                  <label>
                    <span className={styles.visuallyHidden}>{text.stepName}</span>
                    <input
                      value={step.name}
                      disabled={!canWrite || pending}
                      maxLength={120}
                      placeholder={text.stepPlaceholder}
                      aria-label={`${text.stepName} ${index + 1}`}
                      onChange={(event) => updateSelected((draft) => ({
                        ...draft,
                        steps: draft.steps.map((item) => (item.key === step.key
                          ? { ...item, name: event.currentTarget.value }
                          : item)),
                      }))}
                      required
                    />
                  </label>
                  <label>
                    <span className={styles.visuallyHidden}>{text.type}</span>
                    <select
                      value={step.queueKind}
                      disabled={!canWrite || pending}
                      aria-label={`${text.type} ${index + 1}`}
                      onChange={(event) => {
                        const queueKind = workOrderQueueKinds.find(
                          (kind) => kind === event.currentTarget.value,
                        ) ?? step.queueKind;
                        updateSelected((draft) => ({
                          ...draft,
                          steps: draft.steps.map((item) => (item.key === step.key
                            ? { ...item, queueKind }
                            : item)),
                        }));
                      }}
                    >
                      {workOrderQueueKinds.map((kind) => (
                        <option key={kind} value={kind}>{queueLabels[kind][locale]}</option>
                      ))}
                    </select>
                  </label>
                  {canWrite ? (
                    <div className={styles.stepActions}>
                      <button
                        type="button"
                        disabled={pending || index === 0}
                        aria-label={`${text.moveUp}: ${step.name || index + 1}`}
                        title={text.moveUp}
                        onClick={() => moveStep(index, -1)}
                      >
                        ↑
                      </button>
                      <button
                        type="button"
                        disabled={pending || index === selected.steps.length - 1}
                        aria-label={`${text.moveDown}: ${step.name || index + 1}`}
                        title={text.moveDown}
                        onClick={() => moveStep(index, 1)}
                      >
                        ↓
                      </button>
                      <button
                        type="button"
                        disabled={pending || selected.steps.length === 1}
                        aria-label={`${text.remove}: ${step.name || index + 1}`}
                        title={text.remove}
                        onClick={() => updateSelected((draft) => ({
                          ...draft,
                          steps: draft.steps.filter((item) => item.key !== step.key),
                        }))}
                      >
                        ×
                      </button>
                    </div>
                  ) : null}
                </li>
              ))}
            </ol>

            {!canWrite ? <p className={styles.readOnly}>{text.readOnly}</p> : null}
            {feedback ? (
              <p
                className={feedback.kind === 'error' ? styles.error : styles.success}
                role={feedback.kind === 'error' ? 'alert' : 'status'}
              >
                {feedback.message}
              </p>
            ) : null}
            {canWrite ? (
              <footer className={styles.footer}>
                <ActionButton
                  type="submit"
                  pending={pending}
                  pendingLabel={text.saving}
                >
                  {text.save}
                </ActionButton>
              </footer>
            ) : null}
          </form>
        ) : (
          <div className={styles.blankState}><p>{text.empty}</p></div>
        )}
      </div>
    </section>
  );
}
