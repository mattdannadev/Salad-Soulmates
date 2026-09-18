import { RecordForm, type Field } from './record-form';
import type { Supplier, SupplierItem } from '@/domain/master-data';
export function SupplierForm({ supplier }: { supplier?: Supplier }) {
  return (
    <RecordForm
      kind="supplier"
      hidden={supplier ? { id: supplier.id } : {}}
      afterSave="/app/suppliers"
      fields={[
        { name: 'name', label: 'Supplier name', required: true, value: supplier?.name },
        { name: 'contact_name', label: 'Contact name', value: supplier?.contact_name },
        { name: 'email', label: 'Email', type: 'email', value: supplier?.email },
        { name: 'phone', label: 'Phone', value: supplier?.phone },
        {
          name: 'lead_time_days',
          label: 'Lead time (days)',
          type: 'number',
          min: 0,
          step: '1',
          required: true,
          value: supplier?.lead_time_days ?? 0,
        },
        {
          name: 'active',
          label: 'Active supplier',
          type: 'checkbox',
          value: supplier?.active ?? true,
        },
      ]}
    />
  );
}
export function PackForm({
  pack,
  ingredientId,
  unit,
  suppliers,
}: {
  pack?: SupplierItem;
  ingredientId: string;
  unit: string;
  suppliers: Supplier[];
}) {
  const fields: Field[] = [
    {
      name: 'supplier_id',
      label: 'Supplier',
      type: 'select',
      required: true,
      value: pack?.supplier_id,
      options: [
        { value: '', label: 'Choose supplier' },
        ...suppliers.map((s) => ({ value: s.id, label: s.name + (s.active ? '' : ' (inactive)') })),
      ],
    },
    { name: 'supplier_sku', label: 'Supplier SKU', value: pack?.supplier_sku },
    {
      name: 'purchase_uom',
      label: 'Purchase unit',
      type: 'select',
      value: pack?.purchase_uom ?? 'bag',
      options: ['pail', 'bag', 'case', 'each'].map((value) => ({ value, label: value })),
    },
    {
      name: 'pack_quantity',
      label: 'Quantity in one purchase unit',
      type: 'number',
      min: 0.0001,
      required: true,
      value: pack?.pack_quantity,
    },
    {
      name: 'pack_quantity_uom',
      label: 'Content unit',
      type: 'select',
      value: pack?.pack_quantity_uom ?? unit,
      options: ['lb', 'oz', 'gal', 'each'].map((value) => ({ value, label: value })),
      hint: `Inventory uses ${unit}. A different unit needs a validated conversion before future purchasing.`,
    },
    {
      name: 'is_preferred',
      label: 'Preferred pack for this ingredient',
      type: 'checkbox',
      value: pack?.is_preferred ?? false,
    },
    { name: 'active', label: 'Active pack', type: 'checkbox', value: pack?.active ?? true },
    { name: 'notes', label: 'Notes', type: 'textarea', value: pack?.notes },
  ];
  return (
    <RecordForm
      kind="pack"
      fields={fields}
      hidden={{ ingredient_id: ingredientId, ...(pack ? { id: pack.id } : {}) }}
      afterSave={`/app/ingredients/${ingredientId}`}
    />
  );
}
