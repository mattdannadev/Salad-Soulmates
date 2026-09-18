'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import type { Ingredient, ActionResult } from '@/domain/master-data';
export function IngredientForm({
  ingredient,
  spanish = '',
  allergens = [],
  selected = [],
}: {
  ingredient?: Ingredient;
  spanish?: string;
  allergens?: { id: string; name: string }[];
  selected?: string[];
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const router = useRouter();
  return (
    <form
      className="record-form"
      onSubmit={(e) => {
        e.preventDefault();
        const f = new FormData(e.currentTarget);
        if (
          ingredient?.active &&
          !f.has('active') &&
          !window.confirm('Deactivate this ingredient? Existing history will be retained.')
        )
          return;
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
              active: f.has('active'),
              allergen_ids: f.getAll('allergen_ids'),
            });
            setResult(response);
            if (response.ok) {
              router.push(`/app/ingredients/${response.id}`);
              router.refresh();
            }
          } catch {
            setResult({ ok: false, message: 'Unable to connect. Please try again.' });
          }
        });
      }}
    >
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
          <select name="category" defaultValue={ingredient?.category ?? 'Dry'}>
            {['Dry', 'Liquid', 'Refrigerated'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
        </label>
        <label>
          Base unit
          <select name="default_uom" defaultValue={ingredient?.default_uom ?? 'lb'}>
            {['lb', 'oz', 'gal', 'each'].map((x) => (
              <option key={x}>{x}</option>
            ))}
          </select>
          <small>Inventory stays in this unit. Mass and volume are never guessed.</small>
        </label>
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
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'notice' : 'error-notice'}>
          {result.message}
        </p>
      )}
      <button disabled={pending}>{pending ? 'Saving…' : 'Save ingredient'}</button>
    </form>
  );
}
