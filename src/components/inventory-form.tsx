'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import type { Ingredient, ActionResult } from '@/domain/master-data';

const adjustmentTypes = [
  { value: 'ManualGain', label: 'Manual gain', direction: 1 },
  { value: 'ManualShrink', label: 'Manual shrink', direction: -1 },
  { value: 'OrderUsage', label: 'Usage for filling orders', direction: -1 },
] as const;

export default function InventoryForm({
  ingredients,
  initialIngredientId = '',
}: {
  ingredients: Ingredient[];
  initialIngredientId?: string;
}) {
  const [ingredientId, setIngredientId] = useState(initialIngredientId);
  const [result, setResult] = useState<ActionResult>();
  const requestId = useRef<string | undefined>(undefined);
  const [pending, start] = useTransition();
  const router = useRouter();
  const selected = ingredients.find((i) => i.id === ingredientId);
  const [eventType, setEventType] = useState<(typeof adjustmentTypes)[number]['value']>('ManualGain');
  const selectedType = adjustmentTypes.find((type) => type.value === eventType)
    ?? adjustmentTypes[0];
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
          event_type: eventType,
          quantity_delta: selectedType.direction * Number(values.get('quantity')),
          reason_note: values.get('reason_note'),
          effective_on: values.get('effective_on'),
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
        <legend>Record inventory adjustment</legend>
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
            Adjustment type
            <select
              value={eventType}
              onChange={(event) => {
                const nextEventType = adjustmentTypes.find(
                  (type) => type.value === event.target.value,
                );
                if (nextEventType) setEventType(nextEventType.value);
              }}
            >
              {adjustmentTypes.map((type) => (
                <option key={type.value} value={type.value}>{type.label}</option>
              ))}
            </select>
          </label>
          <label>
            Effective date *
            <input name="effective_on" type="date" required defaultValue={new Date().toLocaleDateString('en-CA')} />
          </label>
          <label>
            Quantity
            {' '}
            {selected ? `(${selected.default_uom})` : ''}
            {' '}
            *
            <input name="quantity" type="number" required min="0.0001" step="0.0001" />
            <small>
              {selectedType.direction > 0 ? 'This will add stock.' : 'This will remove stock.'}
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
          Entries preserve history. Correct a mistake with a new adjustment. Purchase-order receipts
          are recorded from Receiving, not here.
        </p>
        <button type="submit" disabled={!selected || pending}>
          {pending ? 'Saving…' : 'Record adjustment'}
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
