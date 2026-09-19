'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import type { Ingredient, ActionResult } from '@/domain/master-data';

export default function InventoryForm({ ingredients }: { ingredients: Ingredient[] }) {
  const [ingredientId, setIngredientId] = useState('');
  const [result, setResult] = useState<ActionResult>();
  const requestId = useRef<string | undefined>(undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  const selected = ingredients.find((i) => i.id === ingredientId);
  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (!selected || pending) return;
        const form = event.currentTarget;
        const values = new FormData(form);
        const token = requestId.current ?? crypto.randomUUID();
        requestId.current = token;
        const payload = {
          ingredient_id: selected.id,
          uom: selected.default_uom,
          event_type: values.get('event_type'),
          quantity_delta: Number(values.get('quantity_delta')),
          reason_note: values.get('reason_note'),
          request_id: token,
        };
        start(async () => {
          try {
            const response = await saveRecord('inventory', payload);
            setResult(response);
            if (response.ok) {
              requestId.current = undefined;
              form.reset();
              setIngredientId('');
              router.refresh();
            }
          } catch {
            setResult({
              ok: false,
              message:
                'Connection interrupted. Retry these same values to avoid a duplicate entry.',
            });
          }
        });
      }}
    >
      <fieldset disabled={pending}>
        <legend>New inventory entry</legend>
        <div className="form-grid">
          <label>
            Ingredient *
            <select required value={ingredientId} onChange={(e) => setIngredientId(e.target.value)}>
              <option value="">Choose ingredient</option>
              {ingredients.map((i) => (
                <option key={i.id} value={i.id}>
                  {i.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Entry type
            <select name="event_type">
              <option value="OpeningBalance">Opening balance</option>
              <option value="Adjustment">Adjustment</option>
            </select>
          </label>
          <label>
            Quantity change
            {' '}
            {selected ? `(${selected.default_uom})` : ''}
            {' '}
            *
            <input name="quantity_delta" type="number" required step="0.0001" />
            <small>
              Opening balance: positive quantity. Adjustment: add with +, subtract with −.
            </small>
          </label>
          <label>
            Reason *
            <textarea
              name="reason_note"
              required
              minLength={3}
              maxLength={1000}
              placeholder="What was counted or corrected?"
            />
          </label>
        </div>
        <p className="subtle">
          Entries preserve history. Correct a mistake with a new adjustment. This does not record
          production consumption.
        </p>
        <button type="submit" disabled={!selected || pending}>
          {pending ? 'Saving…' : 'Record inventory entry'}
        </button>
      </fieldset>
      {result && (
        <p className={result.ok ? 'notice' : 'error-notice'} role={result.ok ? 'status' : 'alert'}>
          {result.message}
        </p>
      )}
    </form>
  );
}
