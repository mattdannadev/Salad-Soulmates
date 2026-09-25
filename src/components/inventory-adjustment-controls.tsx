'use client';

import { useRef, useState } from 'react';
import type { Ingredient } from '@/domain/master-data';
import InventoryForm from './inventory-form';

export default function InventoryAdjustmentControls({
  ingredients,
  ingredientToAdjustId = '',
}: {
  ingredients: Ingredient[];
  ingredientToAdjustId?: string;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [ingredientId, setIngredientId] = useState('');
  function open(ingredientIdToAdjust = '') {
    setIngredientId(ingredientIdToAdjust);
    dialog.current?.showModal();
  }
  return (
    <>
      <button type="button" onClick={() => open(ingredientToAdjustId)}>
        {ingredientToAdjustId ? 'Adjust' : 'Record inventory adjustment'}
      </button>
      <dialog ref={dialog} className="confirmation" aria-labelledby="inventory-adjustment-heading">
        <div className="row">
          <h2 id="inventory-adjustment-heading">Record inventory adjustment</h2>
          <button type="button" className="secondary" onClick={() => dialog.current?.close()}>
            Close
          </button>
        </div>
        <InventoryForm key={ingredientId || 'choose-ingredient'} ingredients={ingredients} initialIngredientId={ingredientId} />
      </dialog>
    </>
  );
}
