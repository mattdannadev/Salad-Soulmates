'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import { RecordForm, type Field } from './record-form';

interface Family {
  code: string;
  label_en: string;
  label_es: string;
  sort_order: number;
  active: boolean;
}
interface Unit {
  id: string;
  family_code: string;
  code: string;
  label_en: string;
  label_es: string;
  measurement_system: 'metric' | 'imperial' | 'universal';
  is_inventory_unit: boolean;
  is_purchase_unit: boolean;
  sort_order: number;
  active: boolean;
}

function DeleteUnit({ unit }: { unit: Unit }) {
  const [pending, start] = useTransition();
  const [message, setMessage] = useState('');
  const [confirming, setConfirming] = useState(false);
  const router = useRouter();
  return (
    <div className="reference-delete">
      {confirming ? (
        <>
          <p>{`Delete ${unit.label_en}? Units already used cannot be deleted.`}</p>
          <button
            type="button"
            className="secondary"
            disabled={pending}
            onClick={() => {
              start(async () => {
                const result = await saveRecord('uom-delete', { id: unit.id, code: unit.code });
                setMessage(result.message);
                if (result.ok) router.refresh();
              });
            }}
          >
            {pending ? 'Deleting…' : 'Confirm permanent deletion'}
          </button>
          <button type="button" className="secondary" disabled={pending} onClick={() => setConfirming(false)}>
            Cancel
          </button>
        </>
      ) : (
        <button type="button" className="secondary" onClick={() => setConfirming(true)}>
          Delete permanently
        </button>
      )}
      {message ? <p role="status">{message}</p> : null}
    </div>
  );
}

function UnitForm({
  unit = undefined,
  families,
  familyCode = undefined,
}: { unit?: Unit; families: Family[]; familyCode?: string }) {
  const fields: Field[] = [
    {
      name: 'family_code', label: 'Measurement type', type: 'select', required: true, value: unit?.family_code ?? familyCode, options: families.filter((family) => family.active || family.code === unit?.family_code).map((family) => ({ value: family.code, label: family.label_en })),
    },
    {
      name: 'code', label: 'Stable code', required: true, value: unit?.code, readOnly: Boolean(unit), hint: 'Codes are stored in operational records and cannot be changed.',
    },
    {
      name: 'label_en', label: 'English label', required: true, value: unit?.label_en,
    },
    {
      name: 'label_es', label: 'Spanish label', required: true, value: unit?.label_es,
    },
    {
      name: 'measurement_system', label: 'Measurement system', type: 'select', required: true, value: unit?.measurement_system ?? 'universal', options: [{ value: 'metric', label: 'Metric' }, { value: 'imperial', label: 'Imperial' }, { value: 'universal', label: 'Universal / count' }],
    },
    {
      name: 'sort_order', label: 'Sort order', type: 'number', required: true, min: 0, value: unit?.sort_order ?? 0,
    },
    {
      name: 'is_inventory_unit', label: 'Use for ingredient quantities', type: 'checkbox', value: unit?.is_inventory_unit ?? true,
    },
    {
      name: 'is_purchase_unit', label: 'Use for supplier purchases', type: 'checkbox', value: unit?.is_purchase_unit ?? false,
    },
    {
      name: 'active', label: 'Active', type: 'checkbox', value: unit?.active ?? true,
    },
  ];
  return (
    <>
      <RecordForm kind="uom" submit={unit ? 'Save unit' : 'Add unit'} hidden={{ id: unit?.id }} fields={fields} />
      {unit ? <DeleteUnit unit={unit} /> : null}
    </>
  );
}

export default function UomCatalogManager({
  families,
  units,
}: { families: Family[]; units: Unit[] }) {
  const orderedFamilies = [...families].sort((a, b) => a.sort_order - b.sort_order);

  return (
    <section className="panel unit-catalog" id="units" aria-labelledby="unit-catalog-title">
      <div className="unit-catalog-intro">
        <div>
          <p className="eyebrow">MEASUREMENT SETUP</p>
          <h2 id="unit-catalog-title">Types and units</h2>
          <p>
            Types group related units: Weight, Volume, Count, and Packaging. Open a unit to edit
            its labels, measurement system, where it appears, or its availability.
          </p>
        </div>
        <div className="unit-catalog-key" aria-label="How units are used">
          <strong>Where units appear</strong>
          <span>Ingredient quantities and supplier purchases are selected per unit.</span>
        </div>
      </div>

      <div className="unit-type-grid">
        {orderedFamilies.map((family) => {
          const familyUnits = units
            .filter((unit) => unit.family_code === family.code)
            .sort((a, b) => a.sort_order - b.sort_order);
          return (
            <section className="unit-type-card" key={family.code} aria-labelledby={`unit-type-${family.code}`}>
              <header className="unit-type-heading">
                <div>
                  <p className="eyebrow">MEASUREMENT TYPE</p>
                  <h3 id={`unit-type-${family.code}`}>{family.code === 'mass' ? 'Weight' : family.label_en}</h3>
                  <p>{family.label_es}</p>
                </div>
                <span className={family.active ? 'badge' : 'badge muted'}>
                  {family.active ? `${familyUnits.length} units` : 'Inactive type'}
                </span>
              </header>
              <div className="unit-table-heading" aria-hidden="true">
                <span>Unit</span>
                <span>System</span>
                <span>Used for</span>
                <span>Status</span>
              </div>
              <div className="unit-table-rows">
                {familyUnits.map((unit) => (
                  <details className="unit-row" key={unit.id}>
                    <summary>
                      <span className="unit-row-name">
                        <strong>{unit.label_en}</strong>
                        <small>
                          {unit.label_es}
                          {' '}
                          ·
                          {' '}
                          {unit.code}
                        </small>
                      </span>
                      <span className="unit-row-system">{unit.measurement_system}</span>
                      <span className="unit-row-uses">
                        {unit.is_inventory_unit ? 'Ingredient' : ''}
                        {unit.is_inventory_unit && unit.is_purchase_unit ? ' · ' : ''}
                        {unit.is_purchase_unit ? 'Purchase' : ''}
                      </span>
                      <span className={unit.active ? 'badge' : 'badge muted'}>{unit.active ? 'Active' : 'Inactive'}</span>
                    </summary>
                    <div className="unit-row-form"><UnitForm unit={unit} families={families} /></div>
                  </details>
                ))}
                {!familyUnits.length ? <p className="unit-empty">No units in this type yet.</p> : null}
              </div>
              {family.active ? (
                <details className="unit-add">
                  <summary>
                    + Add unit to
                    {family.code === 'mass' ? 'Weight' : family.label_en}
                  </summary>
                  <div className="unit-row-form"><UnitForm families={families} familyCode={family.code} /></div>
                </details>
              ) : null}
            </section>
          );
        })}
      </div>
      <div className="unit-catalog-footer">
        <p>
          Need another type? Add it here, then add its units. Codes stay fixed once a unit is saved.
        </p>
        <details className="unit-add-type">
          <summary>+ Add measurement type</summary>
          <RecordForm
            kind="uom-family"
            submit="Add type"
            fields={[
              {
                name: 'code', label: 'Stable code', required: true, hint: 'Lowercase letters, numbers, and underscores only.',
              },
              { name: 'label_en', label: 'English label', required: true },
              { name: 'label_es', label: 'Spanish label', required: true },
              {
                name: 'sort_order', label: 'Sort order', type: 'number', required: true, min: 0, value: 0,
              },
              {
                name: 'active', label: 'Active', type: 'checkbox', value: true,
              },
            ]}
          />
        </details>
      </div>
    </section>
  );
}
