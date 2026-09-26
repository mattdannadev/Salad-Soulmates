'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import { RecordForm, type Field } from './record-form';

type Family = { code: string; label_en: string; label_es: string; sort_order: number; active: boolean };
type Unit = {
  id: string; family_code: string; code: string; label_en: string; label_es: string;
  measurement_system: 'metric' | 'imperial' | 'universal'; is_inventory_unit: boolean;
  is_purchase_unit: boolean; sort_order: number; active: boolean;
};

function UnitForm({ unit, families }: { unit?: Unit; families: Family[] }) {
  const fields: Field[] = [
    { name: 'family_code', label: 'UOM family', type: 'select', required: true, value: unit?.family_code, options: families.filter((family) => family.active).map((family) => ({ value: family.code, label: family.label_en })) },
    { name: 'code', label: 'Stable code', required: true, value: unit?.code, readOnly: Boolean(unit), hint: 'Codes are stored in operational records and cannot be changed.' },
    { name: 'label_en', label: 'English label', required: true, value: unit?.label_en },
    { name: 'label_es', label: 'Spanish label', required: true, value: unit?.label_es },
    { name: 'measurement_system', label: 'Measurement system', type: 'select', required: true, value: unit?.measurement_system ?? 'universal', options: [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }, { value: 'universal', label: 'Universal / count' }] },
    { name: 'sort_order', label: 'Sort order', type: 'number', required: true, min: 0, value: unit?.sort_order ?? 0 },
    { name: 'is_inventory_unit', label: 'Available as an ingredient base/content unit', type: 'checkbox', value: unit?.is_inventory_unit ?? true },
    { name: 'is_purchase_unit', label: 'Available as a supplier purchase unit', type: 'checkbox', value: unit?.is_purchase_unit ?? false },
    { name: 'active', label: 'Active', type: 'checkbox', value: unit?.active ?? true },
  ];
  return <>
    <RecordForm kind="uom" submit={unit ? 'Save unit' : 'Add unit'} hidden={{ id: unit?.id }} fields={fields} />
    {unit ? <DeleteUnit unit={unit} /> : null}
  </>;
}

function DeleteUnit({ unit }: { unit: Unit }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const router = useRouter();
  return <div className="reference-delete">
    <button type="button" className="secondary" disabled={pending} onClick={() => {
      if (!window.confirm(`Delete ${unit.label_en}? Units already used cannot be deleted.`)) return;
      start(async () => { const result = await saveRecord('uom-delete', { id: unit.id, code: unit.code }); setMessage(result.message); if (result.ok) router.refresh(); });
    }}>{pending ? 'Deleting…' : 'Delete permanently'}</button>
    {message ? <p role="status">{message}</p> : null}
  </div>;
}

export default function UomCatalogManager({ families, units }: { families: Family[]; units: Unit[] }) {
  return (
    <section className="panel" id="units">
      <p className="eyebrow">UNITS OF MEASURE</p>
      <h2>Shared unit catalog</h2>
      <p>Family selection controls the available units. Metric and imperial are intentionally separate attributes; packaging units describe the pack, not a conversion.</p>
      {families.map((family) => (
        <details key={family.code}>
          <summary>{family.label_en} / {family.label_es}{!family.active ? ' (Inactive)' : ''}</summary>
          {units.filter((unit) => unit.family_code === family.code).sort((a, b) => a.sort_order - b.sort_order).map((unit) => (
            <details key={unit.id}>
              <summary>{unit.label_en} · {unit.measurement_system}{!unit.active ? ' (Inactive)' : ''}</summary>
              <UnitForm unit={unit} families={families} />
            </details>
          ))}
          <details><summary>Add unit to {family.label_en}</summary><UnitForm families={families} /></details>
        </details>
      ))}
      <details>
        <summary>Add UOM family</summary>
        <RecordForm kind="uom-family" submit="Add family" fields={[
          { name: 'code', label: 'Stable code', required: true, hint: 'Lowercase letters, numbers, and underscores only.' },
          { name: 'label_en', label: 'English label', required: true },
          { name: 'label_es', label: 'Spanish label', required: true },
          { name: 'sort_order', label: 'Sort order', type: 'number', required: true, min: 0, value: 0 },
          { name: 'active', label: 'Active', type: 'checkbox', value: true },
        ]} />
      </details>
    </section>
  );
}
