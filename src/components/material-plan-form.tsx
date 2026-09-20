'use client';

import { useId } from 'react';
import { facilityDate } from '@/domain/format';
import { MAX_BATCH_COUNT } from '@/domain/purchasing';
import PurchasingForm from './purchasing-form';

export default function MaterialPlanForm({
  choices,
  locale,
}: {
  choices: { id: string; label: string }[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  if (choices.length === 0) {
    return (
      <p className="notice">
        {es
          ? 'Se necesita una receta publicada de 40 galones para crear una hoja.'
          : 'A released 40-gallon recipe is needed before creating a worksheet.'}
      </p>
    );
  }
  return (
    <PurchasingForm
      operation="save-plan"
      locale={locale}
      label={es ? 'Calcular y guardar requisitos' : 'Calculate & save requirements'}
      destination={(id) => `/app/materials?plan=${id}`}
      payload={(form, requestId) => ({
        id: requestId,
        name: form.get('name'),
        needed_on: form.get('needed_on'),
        batches: choices
          .map((choice) => ({
            recipe_version_id: choice.id,
            batch_count: Number(form.get(choice.id)),
          }))
          .filter((batch) => batch.batch_count !== 0),
      })}
    >
      <div className="form-grid">
        <label htmlFor={`${prefix}-name`}>
          {es ? 'Nombre de la hoja' : 'Worksheet name'}
          <input
            id={`${prefix}-name`}
            name="name"
            required
            maxLength={120}
            placeholder={
              es ? 'Producción de la próxima semana' : 'Next week’s production'
            }
          />
        </label>
        <label htmlFor={`${prefix}-date`}>
          {es ? 'Materiales necesarios para' : 'Materials needed by'}
          <input
            id={`${prefix}-date`}
            type="date"
            name="needed_on"
            required
            defaultValue={facilityDate()}
          />
        </label>
      </div>
      <p>
        {es
          ? 'Ingresa lotes de 40 galones. Cero excluye una receta.'
          : 'Enter 40-gallon batch counts. Leave zero to exclude a recipe.'}
      </p>
      <div className="form-grid">
        {choices.map((choice) => (
          <label key={choice.id} htmlFor={`${prefix}-${choice.id}`}>
            {choice.label}
            <input
              id={`${prefix}-${choice.id}`}
              name={choice.id}
              type="number"
              min={0}
              max={MAX_BATCH_COUNT}
              step="1"
              defaultValue="0"
              required
            />
          </label>
        ))}
      </div>
    </PurchasingForm>
  );
}
