'use client';

import { useId, useState } from 'react';
import type { MouseEvent } from 'react';
import type { Ingredient } from '@/domain/master-data';
import InventoryForm from './inventory-form';
import useNativeDialog from './use-native-dialog';

export default function InventoryAdjustmentControls({
  ingredients,
  ingredientToAdjustId = '',
}: {
  ingredients: Ingredient[];
  ingredientToAdjustId?: string;
}) {
  const [pending, setPending] = useState(false);
  const {
    dialog, openDialog, closeDialog, onCancel, onClose,
  } = useNativeDialog(pending);
  const id = useId();
  const [ingredientId, setIngredientId] = useState('');
  function open(event: MouseEvent<HTMLButtonElement>) {
    setIngredientId(ingredientToAdjustId);
    openDialog(event);
  }
  return (
    <>
      <button type="button" onClick={open}>
        {ingredientToAdjustId ? 'Adjust' : 'Record inventory adjustment'}
      </button>
      <dialog ref={dialog} className="confirmation" aria-labelledby={`${id}-heading`} aria-describedby={`${id}-description`} onCancel={onCancel} onClose={onClose}>
        <div className="row">
          <h2 id={`${id}-heading`}>Record inventory adjustment</h2>
          <button type="button" className="secondary" disabled={pending} onClick={closeDialog}>
            Close
          </button>
        </div>
        <p id={`${id}-description`}>Record a stock correction for an ingredient.</p>
        <InventoryForm key={ingredientId || 'choose-ingredient'} ingredients={ingredients} initialIngredientId={ingredientId} onPendingChange={setPending} />
      </dialog>
    </>
  );
}
