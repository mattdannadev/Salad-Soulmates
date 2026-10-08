'use client';

import {
  useId,
  useMemo,
  useState,
  useTransition,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import saveProcessProfile from '@/app/process-profile-actions';
import type { ProcessProfile, WorkType } from '@/domain/process-profiles';
import ActionButton from '@/components/action-button';
import styles from './recipe-process-profile.module.css';

type CopyKey = keyof typeof copy.en;

const copy = {
  en: {
    title: 'Process profile',
    introduction: 'Choose the Work Type used when new work is created for this recipe.',
    label: 'Work Type',
    placeholder: 'Choose a Work Type',
    purpose: 'What this work type does',
    sequence: 'What the team will do',
    noSteps: 'No work orders are configured for this Work Type yet.',
    emptyTitle: 'No Work Types are ready to use',
    emptyBody: 'Create a Work Type and add its work orders before assigning this recipe.',
    configure: 'Set up Work Types',
    readOnly: 'You can view this assignment, but you do not have permission to change it.',
    save: 'Save process profile',
    saving: 'Saving…',
    saved: 'Process profile saved.',
    unavailable: 'The assigned Work Type is inactive. Choose an active Work Type to replace it.',
    connectionError: 'Unable to connect. Try saving again.',
  },
  es: {
    title: 'Perfil del proceso',
    introduction: 'Elija el tipo de trabajo usado al crear trabajo nuevo para esta receta.',
    label: 'Tipo de trabajo',
    placeholder: 'Elija un tipo de trabajo',
    purpose: 'Qué hace este tipo de trabajo',
    sequence: 'Lo que hará el equipo',
    noSteps: 'Este tipo de trabajo aún no tiene órdenes de trabajo configuradas.',
    emptyTitle: 'No hay tipos de trabajo listos para usar',
    emptyBody: 'Cree un tipo de trabajo y agregue sus órdenes antes de asignar esta receta.',
    configure: 'Configurar tipos de trabajo',
    readOnly: 'Puede ver esta asignación, pero no tiene permiso para cambiarla.',
    save: 'Guardar perfil del proceso',
    saving: 'Guardando…',
    saved: 'Perfil del proceso guardado.',
    unavailable: 'El tipo de trabajo asignado está inactivo. Elija uno activo para reemplazarlo.',
    connectionError: 'No se pudo conectar. Intente guardar de nuevo.',
  },
} as const;

function text(locale: 'en' | 'es', key: CopyKey) {
  return copy[locale][key];
}

const workOrderKindLabel: Record<
  WorkType['work_order_types'][number]['queue_kind'],
  Record<'en' | 'es', string>
> = {
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

export interface RecipeProcessProfileProps {
  recipeId: string;
  profile: ProcessProfile | null;
  workTypes: WorkType[];
  canWrite: boolean;
  locale: 'en' | 'es';
}

/** Assigns one current Work Type to a recipe without exposing configuration versioning. */
export default function RecipeProcessProfile({
  recipeId,
  profile,
  workTypes,
  canWrite,
  locale,
}: RecipeProcessProfileProps) {
  const fieldId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState(profile?.work_type_id ?? '');
  const [savedWorkTypeId, setSavedWorkTypeId] = useState(
    profile?.active ? profile.work_type_id : '',
  );
  const [feedback, setFeedback] = useState<{ kind: 'success' | 'error'; message: string }>();
  const activeWorkTypes = useMemo(
    () => workTypes.filter((workType) => workType.active),
    [workTypes],
  );
  const assignedWorkType = workTypes.find((workType) => workType.id === profile?.work_type_id);
  const selectedWorkType = workTypes.find((workType) => workType.id === selectedWorkTypeId);
  const assignedInactive = Boolean(assignedWorkType && !assignedWorkType.active);
  const canSave = canWrite
    && selectedWorkType?.active === true
    && selectedWorkTypeId !== savedWorkTypeId;

  function submit() {
    if (!canSave || pending) return;
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await saveProcessProfile({
          id: profile?.id ?? crypto.randomUUID(),
          expected_revision: profile?.revision ?? 0,
          recipe_id: recipeId,
          work_type_id: selectedWorkTypeId,
          active: true,
        });
        setFeedback({
          kind: result.ok ? 'success' : 'error',
          message: result.ok ? text(locale, 'saved') : result.message,
        });
        if (result.ok) {
          setSavedWorkTypeId(selectedWorkTypeId);
          router.refresh();
        }
      } catch {
        setFeedback({ kind: 'error', message: text(locale, 'connectionError') });
      }
    });
  }

  return (
    <section className={styles.card} aria-labelledby={`${fieldId}-title`}>
      <header className={styles.header}>
        <div>
          <h2 id={`${fieldId}-title`}>{text(locale, 'title')}</h2>
          <p>{text(locale, 'introduction')}</p>
        </div>
      </header>

      {activeWorkTypes.length === 0 ? (
        <div className={styles.emptyState}>
          <h3>{text(locale, 'emptyTitle')}</h3>
          <p>{text(locale, 'emptyBody')}</p>
          {canWrite ? (
            <Link className={styles.settingsLink} href="/app/settings/work-types">
              {text(locale, 'configure')}
            </Link>
          ) : null}
        </div>
      ) : (
        <form
          className={styles.form}
          onSubmit={(event) => {
            event.preventDefault();
            submit();
          }}
        >
          <label htmlFor={`${fieldId}-work-type`}>{text(locale, 'label')}</label>
          <div className={styles.controls}>
            <select
              id={`${fieldId}-work-type`}
              value={selectedWorkTypeId}
              disabled={!canWrite || pending}
              aria-describedby={`${fieldId}-description`}
              onChange={(event) => {
                setSelectedWorkTypeId(event.currentTarget.value);
                setFeedback(undefined);
              }}
              required
            >
              <option value="" disabled>
                {text(locale, 'placeholder')}
              </option>
              {assignedInactive ? (
                <option value={assignedWorkType?.id} disabled>
                  {assignedWorkType?.name}
                  {' — '}
                  {locale === 'es' ? 'Inactivo' : 'Inactive'}
                </option>
              ) : null}
              {activeWorkTypes.map((workType) => (
                <option key={workType.id} value={workType.id}>
                  {workType.name}
                </option>
              ))}
            </select>
            {canWrite ? (
              <ActionButton
                type="submit"
                pending={pending}
                pendingLabel={text(locale, 'saving')}
                disabled={!canSave}
              >
                {text(locale, 'save')}
              </ActionButton>
            ) : null}
          </div>
          <div id={`${fieldId}-description`} className={styles.details}>
            {assignedInactive && selectedWorkTypeId === assignedWorkType?.id ? (
              <p className={styles.warning}>{text(locale, 'unavailable')}</p>
            ) : null}
            {selectedWorkType?.description ? (
              <div className={styles.purpose}>
                <h3>{text(locale, 'purpose')}</h3>
                <p>{selectedWorkType.description}</p>
              </div>
            ) : null}
            {selectedWorkType ? (
              <div className={styles.sequence}>
                <h3>{text(locale, 'sequence')}</h3>
                {selectedWorkType.work_order_types.length > 0 ? (
                  <ol>
                    {[...selectedWorkType.work_order_types]
                      .sort((left, right) => left.sequence - right.sequence)
                      .map((workOrderType) => (
                        <li key={workOrderType.id}>
                          <span className={styles.kind}>
                            {workOrderKindLabel[workOrderType.queue_kind][locale]}
                          </span>
                          <span>{workOrderType.name}</span>
                        </li>
                      ))}
                  </ol>
                ) : (
                  <p>{text(locale, 'noSteps')}</p>
                )}
              </div>
            ) : null}
          </div>
          {!canWrite ? <p className={styles.permissionNote}>{text(locale, 'readOnly')}</p> : null}
          {feedback ? (
            <p
              className={feedback.kind === 'error' ? styles.error : styles.success}
              role={feedback.kind === 'error' ? 'alert' : 'status'}
            >
              {feedback.message}
            </p>
          ) : null}
        </form>
      )}
    </section>
  );
}
