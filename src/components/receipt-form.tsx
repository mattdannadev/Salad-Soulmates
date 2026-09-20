'use client';

import type { InboundChoice } from '@/domain/purchasing';

import { useMemo, useState } from 'react';
import { facilityDate } from '@/domain/format';
import { RecordForm } from './record-form';

interface Ingredient {
  id: string;
  name: string;
  default_uom: string;
}
interface Supplier {
  id: string;
  name: string;
}
export default function ReceiptForm({
  ingredients,
  suppliers,
  inbound = [],
  locale = 'en',
}: {
  ingredients: Ingredient[];
  suppliers: Supplier[];
  inbound?: InboundChoice[];
  locale?: 'en' | 'es';
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? '');
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
        submit={
          es ? 'Registrar y actualizar inventario' : 'Post receipt & update inventory'
        }
        fields={[
          {
            name: 'supplier_id',
            label: es ? 'Proveedor' : 'Supplier',
            type: 'select',
            value: supplierId,
            onChange: setSupplierId,
            options: suppliers.map((s) => ({ value: s.id, label: s.name })),
            required: true,
          },
          {
            name: 'received_on',
            label: es ? 'Fecha de recepción' : 'Received date',
            type: 'date',
            value: facilityDate(),
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
            name: 'purchase_draft_line_id',
            label: es
              ? 'Pedido confirmado (opcional)'
              : 'Confirmed inbound order (optional)',
            type: 'select',
            options: [
              { value: '', label: es ? 'Sin pedido vinculado' : 'No linked order' },
              ...inbound
                .filter(
                  (choice) => choice.ingredient_id === ingredientId
                    && choice.supplier_id === supplierId,
                )
                .map((choice) => ({ value: choice.id, label: choice.label })),
            ],
          },
          {
            name: 'quantity',
            label: es ? 'Cantidad' : 'Quantity received',
            type: 'number',
            min: 0.0001,
            step: '0.0001',
            required: true,
          },
          {
            name: 'uom',
            label: es ? 'Unidad base' : 'Base unit',
            value: unit,
            readOnly: true,
          },
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
        ]}
      />
    </>
  );
}
