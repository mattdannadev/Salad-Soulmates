'use client';
import { useMemo, useState } from 'react';
import { RecordForm } from './record-form';

type Ingredient = { id: string; name: string; default_uom: string };
type Supplier = { id: string; name: string };
export function ReceiptForm({
  ingredients,
  suppliers,
  locale = 'en',
}: {
  ingredients: Ingredient[];
  suppliers: Supplier[];
  locale?: 'en' | 'es';
}) {
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? '');
  const [requestId] = useState(() => crypto.randomUUID());
  const unit = useMemo(
    () => ingredients.find((i) => i.id === ingredientId)?.default_uom ?? 'lb',
    [ingredients, ingredientId],
  );
  const es = locale === 'es';
  return (
    <>
      <h2>{es ? 'Registrar recepción' : 'Post supplier receipt'}</h2>
      <RecordForm
        kind="receipt"
        submit={es ? 'Registrar y actualizar inventario' : 'Post receipt & update inventory'}
        fields={[
          {
            name: 'supplier_id',
            label: es ? 'Proveedor' : 'Supplier',
            type: 'select',
            options: suppliers.map((s) => ({ value: s.id, label: s.name })),
            required: true,
          },
          {
            name: 'received_on',
            label: es ? 'Fecha de recepción' : 'Received date',
            type: 'date',
            value: new Date().toISOString().slice(0, 10),
            required: true,
          },
          {
            name: 'supplier_reference',
            label: es ? 'Referencia del proveedor' : 'Supplier reference / PO',
            maxLength: 120,
          },
          {
            name: 'ingredient_id',
            label: es ? 'Ingrediente' : 'Ingredient',
            type: 'select',
            value: ingredientId,
            onChange: setIngredientId,
            options: ingredients.map((i) => ({ value: i.id, label: i.name })),
            required: true,
          },
          {
            name: 'quantity',
            label: es ? 'Cantidad' : 'Quantity received',
            type: 'number',
            min: 0.0001,
            step: 'any',
            required: true,
          },
          { name: 'uom', label: es ? 'Unidad base' : 'Base unit', value: unit, readOnly: true },
          {
            name: 'supplier_lot',
            label: es ? 'Lote del proveedor' : 'Supplier lot',
            maxLength: 120,
          },
          {
            name: 'expiration_date',
            label: es ? 'Fecha de vencimiento' : 'Expiration date',
            type: 'date',
          },
          {
            name: 'note',
            label: es ? 'Notas' : 'Receiving notes',
            type: 'textarea',
            maxLength: 1000,
          },
          { name: 'request_id', label: 'Request ID', type: 'hidden', value: requestId },
        ]}
      />
    </>
  );
}
