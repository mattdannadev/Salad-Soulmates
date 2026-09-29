'use client';

import {
  useId, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import type { Ingredient, ActionResult } from '@/domain/master-data';
import type { ReturnContext } from '@/lib/return-context';
import FormFooter from '@/components/form-footer';
import { ingredientReturnHref } from '@/app/app/ingredients/return-context';
import useNativeDialog from './use-native-dialog';

export default function IngredientForm({
  ingredient = undefined,
  spanish = '',
  allergens = [],
  selected = [],
  categories = [],
  baseUnits = [],
  locale = 'en',
  returnContext,
  directEntry = false,
}: {
  ingredient?: Ingredient;
  spanish?: string;
  allergens?: { id: string; name: string }[];
  selected?: string[];
  categories?: { code: string; label_en: string; label_es: string }[];
  baseUnits?: {
    code: string;
    label_en: string;
    label_es: string;
    family_code: string;
    measurement_system: string;
  }[];
  locale?: 'en' | 'es';
  returnContext: ReturnContext;
  directEntry?: boolean;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const router = useRouter();
  const {
    dialog: confirmation, openDialog, closeDialog, closeAfterAction, onCancel, onClose,
  } = useNativeDialog(pending);
  const confirmationId = useId();
  const pendingForm = useRef<FormData | undefined>(undefined);
  function optionalQuantity(value: FormDataEntryValue | null) {
    return value === null || value === '' ? null : Number(value);
  }
  function submitIngredient(f: FormData) {
    start(async () => {
      try {
        const response = await saveRecord('ingredient', {
          id: ingredient?.id,
          name: f.get('name'),
          spanish_name: f.get('spanish_name'),
          category: f.get('category'),
          default_uom: f.get('default_uom'),
          description: f.get('description'),
          storage_notes: f.get('storage_notes'),
          reorder_point: optionalQuantity(f.get('reorder_point')),
          par_level: optionalQuantity(f.get('par_level')),
          reorder_quantity: optionalQuantity(f.get('reorder_quantity')),
          active: f.has('active'),
          allergen_ids: f.getAll('allergen_ids'),
        });
        setResult(response);
        if (response.ok) {
          const destination = directEntry && !ingredient
            ? `/app/ingredients/${response.id}`
            : ingredientReturnHref(returnContext, response.id);
          router.replace(destination);
          router.refresh();
        }
      } catch {
        setResult({ ok: false, message: 'Unable to connect. Please try again.' });
      }
    });
  }
  return (
    <form
      className="record-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (pending) return;
        if (ingredient?.active && !f.has('active')) {
          pendingForm.current = f;
          const { submitter } = e.nativeEvent;
          openDialog(submitter instanceof HTMLElement ? submitter : e.currentTarget);
          return;
        }
        submitIngredient(f);
      }}
    >
      <dialog ref={confirmation} aria-labelledby={`${confirmationId}-title`} aria-describedby={`${confirmationId}-description`} onCancel={onCancel} onClose={onClose}>
        <h2 id={`${confirmationId}-title`}>Deactivate this ingredient?</h2>
        <p id={`${confirmationId}-description`}>Existing history will be retained.</p>
        <button type="button" disabled={pending} onClick={closeDialog}>
          Cancel
        </button>
        <button
          type="button"
          onClick={() => {
            closeAfterAction();
            if (pendingForm.current) submitIngredient(pendingForm.current);
          }}
          disabled={pending}
        >
          Deactivate
        </button>
      </dialog>
      <div className="form-grid">
        <label>
          Ingredient name *
          <input name="name" required maxLength={120} defaultValue={ingredient?.name} />
        </label>
        <label>
          Approved Spanish name
          <input name="spanish_name" maxLength={120} defaultValue={spanish} />
          <small>Controlled worker display name; review before saving.</small>
        </label>
        <label>
          Category
          <select name="category" defaultValue={ingredient?.category ?? categories[0]?.code}>
            {categories.map((x) => (
              <option key={x.code} value={x.code}>
                {locale === 'es' ? x.label_es : x.label_en}
              </option>
            ))}
          </select>
        </label>
        <label>
          Base unit
          <select name="default_uom" defaultValue={ingredient?.default_uom ?? baseUnits[0]?.code}>
            {baseUnits.map((unit) => (
              <option key={unit.code} value={unit.code}>
                {unit.label_en}
                {' '}
                ·
                {unit.measurement_system}
              </option>
            ))}
          </select>
          <small>
            Available units come from the shared UOM catalog. Mass and volume are never guessed.
          </small>
        </label>
        <fieldset className="wide">
          <legend>
            Inventory controls (
            {ingredient?.default_uom ?? 'base unit'}
            )
          </legend>
          <div className="form-grid">
            <label>
              Low-stock / reorder point
              <input name="reorder_point" type="number" min="0" max="1000000" step="0.0001" defaultValue={ingredient?.reorder_point ?? ''} />
            </label>
            <label>
              Par level
              <input name="par_level" type="number" min="0" max="1000000" step="0.0001" defaultValue={ingredient?.par_level ?? ''} />
            </label>
            <label>
              Default reorder quantity
              <input name="reorder_quantity" type="number" min="0.0001" max="1000000" step="0.0001" defaultValue={ingredient?.reorder_quantity ?? ''} />
            </label>
          </div>
          <small>
            Set the low-stock trigger, target on-hand level, and usual quantity to order. Par must
            be at least the reorder point.
          </small>
        </fieldset>
        <label className="wide">
          Description
          <textarea name="description" defaultValue={ingredient?.description} maxLength={1000} />
        </label>
        <label className="wide">
          Storage notes
          <textarea
            name="storage_notes"
            defaultValue={ingredient?.storage_notes}
            maxLength={1000}
          />
        </label>
      </div>
      <fieldset>
        <legend>Allergens</legend>
        <div className="checks">
          {allergens.length ? (
            allergens.map((a) => (
              <label key={a.id} className="check">
                <input
                  type="checkbox"
                  name="allergen_ids"
                  value={a.id}
                  defaultChecked={selected.includes(a.id)}
                />
                {a.name}
              </label>
            ))
          ) : (
            <p>
              No allergens configured. Add your reviewed allergen list from the Ingredients page.
            </p>
          )}
        </div>
        <small>An empty selection means none recorded; verify before use.</small>
      </fieldset>
      <label className="check">
        <input type="checkbox" name="active" defaultChecked={ingredient?.active ?? true} />
        Active ingredient
      </label>
      <FormFooter
        submitLabel={ingredient ? 'Save changes' : 'Create ingredient'}
        cancelLabel="Cancel"
        cancelHref={directEntry && ingredient ? '/app/ingredients' : ingredientReturnHref(returnContext)}
        pending={pending}
        pendingLabel="Saving…"
        feedback={result ? { kind: result.ok ? 'success' : 'error', message: result.message } : undefined}
      />
    </form>
  );
}
