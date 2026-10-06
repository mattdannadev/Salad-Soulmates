'use client';

import { useId, useState, useTransition } from 'react';
import { saveRecord } from '@/app/actions';
import type { ActionResult, Supplier, SupplierItem } from '@/domain/master-data';
import useNativeDialog from './use-native-dialog';

const purchaseUnits = ['bag', 'case', 'each', 'pail'];

function formText(values: FormData, key: string): string {
  const value = values.get(key);
  return typeof value === 'string' ? value : '';
}

/** Adds a compatible supplier pack without discarding the buyer's purchase draft. */
export default function SupplierPackQuickAdd({
  ingredientId,
  ingredientName,
  inventoryUom,
  suppliers,
  locale,
  onCreated,
}: {
  ingredientId: string;
  ingredientName: string;
  inventoryUom: string;
  suppliers: Supplier[];
  locale: 'en' | 'es';
  onCreated: (pack: SupplierItem) => void;
}) {
  const id = useId();
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const {
    dialog, openDialog, closeDialog, closeAfterAction, onCancel, onClose,
  } = useNativeDialog(pending);
  const es = locale === 'es';
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const savingLabel = es ? 'Guardando…' : 'Saving…';
  const addLabel = es ? 'Agregar presentación' : 'Add supplier pack';

  function submit(form: HTMLFormElement) {
    const values = new FormData(form);
    const supplierId = formText(values, 'supplier_id');
    const supplierSku = formText(values, 'supplier_sku');
    const purchaseUom = formText(values, 'purchase_uom');
    const packQuantity = Number(formText(values, 'pack_quantity'));
    const notes = formText(values, 'notes');
    startTransition(async () => {
      const response = await saveRecord('pack', {
        ingredient_id: ingredientId,
        supplier_id: supplierId,
        supplier_sku: supplierSku,
        purchase_uom: purchaseUom,
        pack_quantity: packQuantity,
        pack_quantity_uom: inventoryUom,
        is_preferred: false,
        active: true,
        notes,
      });
      setResult(response);
      if (!response.ok || !response.id) return;
      onCreated({
        id: response.id,
        ingredient_id: ingredientId,
        supplier_id: supplierId,
        supplier_sku: supplierSku,
        purchase_uom: purchaseUom,
        pack_quantity: packQuantity,
        pack_quantity_uom: inventoryUom,
        is_preferred: false,
        active: true,
        notes,
      });
      form.reset();
      closeAfterAction();
    });
  }

  return (
    <>
      <button type="button" className="secondary" onClick={openDialog}>
        {es ? 'Agregar presentación' : 'Add supplier pack'}
      </button>
      <dialog ref={dialog} className="confirmation" aria-labelledby={`${id}-title`} onCancel={onCancel} onClose={onClose}>
        <h2 id={`${id}-title`}>{es ? 'Agregar presentación de proveedor' : 'Add supplier pack'}</h2>
        <p>
          {ingredientName}
          {' '}
          ·
          {' '}
          {es ? `La cantidad debe estar en ${inventoryUom}.` : `Quantity is measured in ${inventoryUom}.`}
        </p>
        <form
          className="record-form"
          onSubmit={(event) => {
            event.preventDefault();
            submit(event.currentTarget);
          }}
        >
          <div className="form-grid">
            <label htmlFor={`${id}-supplier`}>
              {es ? 'Proveedor' : 'Supplier'}
              {' '}
              *
              <select id={`${id}-supplier`} name="supplier_id" required defaultValue="">
                <option value="">{es ? 'Elegir proveedor' : 'Choose supplier'}</option>
                {activeSuppliers.map((supplier) => (
                  <option key={supplier.id} value={supplier.id}>{supplier.name}</option>
                ))}
              </select>
            </label>
            <label htmlFor={`${id}-sku`}>
              {es ? 'SKU del proveedor' : 'Supplier SKU'}
              <input id={`${id}-sku`} name="supplier_sku" maxLength={100} />
            </label>
            <label htmlFor={`${id}-unit`}>
              {es ? 'Unidad de compra' : 'Purchase unit'}
              {' '}
              *
              <select id={`${id}-unit`} name="purchase_uom" required defaultValue="bag">
                {purchaseUnits.map((unit) => <option key={unit} value={unit}>{unit}</option>)}
              </select>
            </label>
            <label htmlFor={`${id}-quantity`}>
              {es ? `Cantidad por unidad (${inventoryUom})` : `Quantity per unit (${inventoryUom})`}
              {' '}
              *
              <input id={`${id}-quantity`} name="pack_quantity" type="number" min="0.0001" step="0.0001" required />
            </label>
            <label className="wide" htmlFor={`${id}-notes`}>
              {es ? 'Notas' : 'Notes'}
              <textarea id={`${id}-notes`} name="notes" rows={2} maxLength={1000} />
            </label>
          </div>
          {result && <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'notice' : 'error-notice'}>{result.message}</p>}
          <div className="order-dialog-actions">
            <button type="button" className="secondary" disabled={pending} onClick={closeDialog}>{es ? 'Cancelar' : 'Cancel'}</button>
            <button type="submit" disabled={pending}>{pending ? savingLabel : addLabel}</button>
          </div>
        </form>
      </dialog>
    </>
  );
}
