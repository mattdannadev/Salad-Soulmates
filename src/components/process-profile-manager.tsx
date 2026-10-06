'use client';

import {
  useDeferredValue, useId, useMemo, useState, useTransition,
} from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import saveProcessProfile from '@/app/process-profile-actions';
import ActionButton from '@/components/action-button';
import type { ProcessProfile, WorkType } from '@/domain/process-profiles';
import styles from './process-profile-manager.module.css';

type Locale = 'en' | 'es';
type WorkOrderKind = WorkType['work_order_types'][number]['queue_kind'];

export interface ProcessProfileRecipe {
  id: string;
  name: string;
  productName: string;
}

export interface ProcessProfileManagerProps {
  recipes: ProcessProfileRecipe[];
  profiles: ProcessProfile[];
  workTypes: WorkType[];
  canWrite: boolean;
  locale: Locale;
}

const workOrderKindLabel: Record<WorkOrderKind, Record<Locale, string>> = {
  pre_op: { en: 'Pre-Op', es: 'Preoperación' },
  post_op: { en: 'Post-Op', es: 'Postoperación' },
  ingredient_prep: { en: 'Ingredient Prep', es: 'Preparación' },
  mixing: { en: 'Mixing', es: 'Mezclado' },
  shipment_loading: { en: 'Loading', es: 'Carga' },
  receiving: { en: 'Receiving', es: 'Recepción' },
  packaging: { en: 'Packaging', es: 'Empaque' },
  maintenance: { en: 'Maintenance', es: 'Mantenimiento' },
  cleaning: { en: 'Cleaning', es: 'Limpieza' },
  other: { en: 'Other', es: 'Otro' },
};

function recipeCountLabel(count: number, locale: Locale) {
  if (locale === 'es') return `${count} recetas`;
  return `${count} ${count === 1 ? 'recipe' : 'recipes'}`;
}

function WorkOrderFlow({ workType, locale }: { workType: WorkType; locale: Locale }) {
  const steps = [...workType.work_order_types].sort(
    (left, right) => left.sequence - right.sequence,
  );
  if (steps.length === 0) {
    return (
      <p className={styles.noSteps}>
        {locale === 'es'
          ? 'Este tipo de trabajo aún no tiene órdenes configuradas.'
          : 'This Work Type does not have work orders yet.'}
      </p>
    );
  }
  return (
    <ol className={styles.flow} aria-label={locale === 'es' ? 'Flujo de trabajo' : 'Work flow'}>
      {steps.map((step) => (
        <li key={step.id}>
          <span className={styles.stepNumber}>{step.sequence}</span>
          <span className={styles.stepText}>
            <span className={styles.kind}>{workOrderKindLabel[step.queue_kind][locale]}</span>
            <span>{step.name}</span>
          </span>
        </li>
      ))}
    </ol>
  );
}

function ProcessProfileRow({
  recipe,
  profile,
  workTypes,
  canWrite,
  locale,
}: {
  recipe: ProcessProfileRecipe;
  profile: ProcessProfile | null;
  workTypes: WorkType[];
  canWrite: boolean;
  locale: Locale;
}) {
  const fieldId = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [savedWorkTypeId, setSavedWorkTypeId] = useState(
    profile?.active ? profile.work_type_id : '',
  );
  const [selectedWorkTypeId, setSelectedWorkTypeId] = useState(savedWorkTypeId);
  const [feedback, setFeedback] = useState<{ kind: 'error' | 'success'; message: string }>();
  const selectedWorkType = workTypes.find(({ id }) => id === selectedWorkTypeId);
  const activeWorkTypes = workTypes.filter(({ active }) => active);
  const assignedInactiveWorkType = profile?.active
    ? workTypes.find(({ id, active }) => id === profile.work_type_id && !active)
    : undefined;
  const changed = selectedWorkTypeId !== savedWorkTypeId;
  const canSave = canWrite && changed && selectedWorkType?.active === true;

  function submit() {
    if (!canSave || pending) return;
    setFeedback(undefined);
    startTransition(async () => {
      try {
        const result = await saveProcessProfile({
          id: profile?.id ?? crypto.randomUUID(),
          expected_revision: profile?.revision ?? 0,
          recipe_id: recipe.id,
          work_type_id: selectedWorkTypeId,
          active: true,
        });
        const savedMessage = locale === 'es'
          ? 'Perfil del proceso guardado.' : 'Process profile saved.';
        setFeedback({
          kind: result.ok ? 'success' : 'error',
          message: result.ok ? savedMessage : result.message,
        });
        if (result.ok) {
          setSavedWorkTypeId(selectedWorkTypeId);
          router.refresh();
        }
      } catch {
        setFeedback({
          kind: 'error',
          message: locale === 'es'
            ? 'No se pudo conectar. Inténtelo de nuevo.'
            : 'Unable to connect. Try again.',
        });
      }
    });
  }

  return (
    <article className={styles.recipeCard}>
      <div className={styles.recipeIdentity}>
        <div>
          <h2>{recipe.name}</h2>
          <p>{recipe.productName}</p>
        </div>
        {!savedWorkTypeId ? (
          <span className={styles.notSet}>{locale === 'es' ? 'Sin configurar' : 'Not set'}</span>
        ) : null}
      </div>
      <form
        className={styles.assignment}
        onSubmit={(event) => {
          event.preventDefault();
          submit();
        }}
      >
        <label htmlFor={fieldId}>{locale === 'es' ? 'Tipo de trabajo' : 'Work Type'}</label>
        <div className={styles.controls}>
          <select
            id={fieldId}
            value={selectedWorkTypeId}
            disabled={!canWrite || pending || activeWorkTypes.length === 0}
            onChange={(event) => {
              setSelectedWorkTypeId(event.currentTarget.value);
              setFeedback(undefined);
            }}
          >
            <option value="">{locale === 'es' ? 'Seleccione un tipo de trabajo' : 'Choose a Work Type'}</option>
            {assignedInactiveWorkType ? (
              <option value={assignedInactiveWorkType.id} disabled>
                {assignedInactiveWorkType.name}
                {' — '}
                {locale === 'es' ? 'Inactivo' : 'Inactive'}
              </option>
            ) : null}
            {activeWorkTypes.map((workType) => (
              <option key={workType.id} value={workType.id}>{workType.name}</option>
            ))}
          </select>
          {canWrite ? (
            <ActionButton
              type="submit"
              pending={pending}
              pendingLabel={locale === 'es' ? 'Guardando…' : 'Saving…'}
              disabled={!canSave}
            >
              {locale === 'es' ? 'Guardar' : 'Save'}
            </ActionButton>
          ) : null}
        </div>
        {selectedWorkType ? (
          <div className={styles.preview}>
            {selectedWorkType.description ? <p>{selectedWorkType.description}</p> : null}
            <WorkOrderFlow workType={selectedWorkType} locale={locale} />
          </div>
        ) : (
          <p className={styles.unassignedHelp}>
            {locale === 'es'
              ? 'Asigne el flujo que se usará cuando se cree trabajo para esta receta.'
              : 'Assign the flow used when work is created for this recipe.'}
          </p>
        )}
        {feedback ? (
          <p
            className={feedback.kind === 'error' ? styles.error : styles.success}
            role={feedback.kind === 'error' ? 'alert' : 'status'}
          >
            {feedback.message}
          </p>
        ) : null}
      </form>
    </article>
  );
}

/** Manages one current Work Type assignment per recipe with an inline work-order preview. */
export default function ProcessProfileManager({
  recipes,
  profiles,
  workTypes,
  canWrite,
  locale,
}: ProcessProfileManagerProps) {
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query.trim().toLocaleLowerCase());
  const visibleRecipes = useMemo(() => recipes.filter((recipe) => (
    `${recipe.name} ${recipe.productName}`.toLocaleLowerCase().includes(deferredQuery)
  )), [deferredQuery, recipes]);

  if (recipes.length === 0) {
    return (
      <section className={styles.emptyState}>
        <h2>{locale === 'es' ? 'Primero cree una receta' : 'Create a recipe first'}</h2>
        <p>
          {locale === 'es'
            ? 'Los perfiles de proceso conectan una receta con un tipo de trabajo reutilizable.'
            : 'Process Profiles connect each recipe to a reusable Work Type.'}
        </p>
        <Link className="button" href="/app/products">
          {locale === 'es' ? 'Ver productos' : 'View products'}
        </Link>
      </section>
    );
  }

  return (
    <section className={styles.manager} aria-label={locale === 'es' ? 'Perfiles del proceso' : 'Process Profiles'}>
      <div className={styles.toolbar}>
        <label htmlFor="process-profile-search">
          {locale === 'es' ? 'Buscar recetas' : 'Search recipes'}
          <input
            id="process-profile-search"
            type="search"
            value={query}
            placeholder={locale === 'es' ? 'Nombre de receta o producto' : 'Recipe or product name'}
            onChange={(event) => setQuery(event.currentTarget.value)}
          />
        </label>
        <span className={styles.count} role="status">
          {recipeCountLabel(visibleRecipes.length, locale)}
        </span>
      </div>

      {workTypes.every(({ active }) => !active) ? (
        <div className={styles.missingSetup}>
          <div>
            <h2>{locale === 'es' ? 'Cree un tipo de trabajo primero' : 'Create a Work Type first'}</h2>
            <p>
              {locale === 'es'
                ? 'Agregue sus tipos de órdenes de trabajo y luego vuelva para asignarlo a las recetas.'
                : 'Add its Work Order Types, then return here to assign it to recipes.'}
            </p>
          </div>
          <Link className="button" href="/app/settings/work-types">
            {locale === 'es' ? 'Configurar tipos de trabajo' : 'Set up Work Types'}
          </Link>
        </div>
      ) : null}

      {!canWrite ? (
        <p className={styles.readOnly}>
          {locale === 'es'
            ? 'Puede ver los perfiles, pero no tiene permiso para cambiarlos.'
            : 'You can view profiles, but you do not have permission to change them.'}
        </p>
      ) : null}

      <div className={styles.list}>
        {visibleRecipes.map((recipe) => (
          <ProcessProfileRow
            key={recipe.id}
            recipe={recipe}
            profile={profiles.find(({ recipe_id: recipeId }) => recipeId === recipe.id) ?? null}
            workTypes={workTypes}
            canWrite={canWrite}
            locale={locale}
          />
        ))}
      </div>

      {visibleRecipes.length === 0 ? (
        <div className={styles.noMatches}>
          <h2>{locale === 'es' ? 'No se encontraron recetas' : 'No recipes found'}</h2>
          <p>{locale === 'es' ? 'Pruebe otro nombre.' : 'Try another name.'}</p>
          <ActionButton type="button" variant="secondary" onClick={() => setQuery('')}>
            {locale === 'es' ? 'Borrar búsqueda' : 'Clear search'}
          </ActionButton>
        </div>
      ) : null}
    </section>
  );
}
