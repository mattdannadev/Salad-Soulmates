'use client';

import type { InboundChoice } from '@/domain/purchasing';

import { useMemo, useState, useId } from 'react';
import { facilityDate } from '@/domain/format';
import type { SupplierItem } from '@/domain/master-data';
import { FieldControl, type Field } from './record-form';
import ReceivingSubmit from './receiving-submit';

interface Ingredient {
  id: string;
  name: string;
  default_uom: string;
  traceability_mode?: string;
}
interface Supplier {
  id: string;
  name: string;
}
export default function ReceiptForm({
  ingredients,
  suppliers,
  inbound = [],
  packs = [],
  locale = 'en',
}: {
  ingredients: Ingredient[];
  suppliers: Supplier[];
  inbound?: InboundChoice[];
  packs?: SupplierItem[];
  locale?: 'en' | 'es';
}) {
  const [supplierId, setSupplierId] = useState(suppliers[0]?.id ?? '');
  const [ingredientId, setIngredientId] = useState(ingredients[0]?.id ?? '');
  const [inboundId, setInboundId] = useState('');
  const [supplierItemId, setSupplierItemId] = useState('');
  const unit = useMemo(
    () => ingredients.find((i) => i.id === ingredientId)?.default_uom ?? 'lb',
    [ingredients, ingredientId],
  );
  const es = locale === 'es';
  const formId = useId();
  const selectedInbound = inbound.find((choice) => choice.id === inboundId);
  const matchingPacks = packs.filter(
    (pack) => pack.active
      && pack.ingredient_id === ingredientId
      && pack.supplier_id === supplierId
      && pack.pack_quantity_uom === unit,
  );
  const selectedInboundPack = matchingPacks.find(
    (pack) => pack.id === selectedInbound?.supplier_item_id,
  );
  let packOptions = matchingPacks;
  if (selectedInbound) packOptions = selectedInboundPack ? [selectedInboundPack] : [];
  const packLabel = selectedInbound
    ? 'Supplier pack from confirmed order' : 'Supplier item / pack (optional)';
  const packLabelEs = selectedInbound
    ? 'Presentación del pedido confirmado' : 'Presentación del proveedor (opcional)';
  const inactivePackHint = es
    ? 'La presentación del pedido ya no está activa.'
    : 'The order’s supplier pack is no longer active.';
  const fields: Field[] = [
    {
      name: 'supplier_id',
      label: es ? 'Proveedor' : 'Supplier',
      type: 'select',
      value: supplierId,
      onChange: (value) => {
        setSupplierId(value);
        setInboundId('');
        setSupplierItemId('');
      },
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
      onChange: (value) => {
        setIngredientId(value);
        setInboundId('');
        setSupplierItemId('');
      },
      options: ingredients.map((i) => ({ value: i.id, label: i.name })),
      required: true,
    },
    {
      name: 'purchase_draft_line_id',
      label: es ? 'Pedido confirmado (opcional)' : 'Confirmed inbound order (optional)',
      type: 'select',
      value: inboundId,
      onChange: setInboundId,
      options: [
        { value: '', label: es ? 'Sin pedido vinculado' : 'No linked order' },
        ...inbound
          .filter(
            (choice) => choice.ingredient_id === ingredientId && choice.supplier_id === supplierId,
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
      label: es
        ? 'Lote proporcionado por el proveedor (si aparece)'
        : 'Supplier-provided lot (if shown)',
      maxLength: 120,
      hint: es
        ? 'Si no se proporciona, Salad Soulmates asignará un lote de origen interno al registrar la recepción.'
        : 'If none is shown, Salad Soulmates assigns a distinct internal source lot when the receipt is posted.',
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
    {
      name: 'supplier_item_id',
      label: es ? packLabelEs : packLabel,
      type: 'select',
      value: selectedInbound ? selectedInboundPack?.id ?? '' : supplierItemId,
      onChange: setSupplierItemId,
      required: Boolean(selectedInbound),
      options: [
        { value: '', label: es ? 'Sin presentación' : 'No configured pack' },
        ...packOptions
          .map((pack) => ({
            value: pack.id,
            label: `${pack.supplier_sku || pack.purchase_uom} · ${pack.pack_quantity} ${unit}`,
          })),
      ],
      hint: selectedInbound && !selectedInboundPack ? inactivePackHint : undefined,
    },
    {
      name: 'package_lines',
      label: es ? 'Cantidad en cada paquete' : 'Quantity in each physical package',
      type: 'textarea',
      required: true,
      maxLength: 30000,
      hint: es
        ? 'Una cantidad por línea. Ejemplo: 25 | CODIGO-UNICO. Omite el código para generar una etiqueta.'
        : 'One quantity per line, in the base unit. Example: 25 | UNIQUE-PACKAGE-CODE. Leave off the barcode to generate an internal label. Use a supplier barcode only when it uniquely identifies this physical package, never a shared UPC or lot barcode.',
    },
  ];
  return (
    <>
      <h2>{es ? 'Registrar recepción' : 'Post supplier receipt'}</h2>
      <ReceivingSubmit
        operation="receive"
        locale={locale}
        submit={es ? 'Registrar y actualizar inventario' : 'Post receipt & update inventory'}
      >
        <div className="form-grid">
          {fields.map((field) => (
            <label
              key={field.name}
              className={field.type === 'textarea' ? 'wide' : ''}
              htmlFor={`${formId}-${field.name}`}
            >
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              <FieldControl field={field} id={`${formId}-${field.name}`} />
              {field.hint && <small>{field.hint}</small>}
            </label>
          ))}
        </div>
      </ReceivingSubmit>
    </>
  );
}
