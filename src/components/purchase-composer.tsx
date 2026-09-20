'use client';

import { useId, useState } from 'react';
import type { Supplier, SupplierItem } from '@/domain/master-data';
import {
  type MaterialAvailability,
  recommendPurchase,
  selectSupplierPack,
  MAX_PURCHASE_UNITS,
} from '@/domain/purchasing';
import { formatNumber } from '@/domain/format';
import PurchasingForm from './purchasing-form';

export default function PurchaseComposer({
  planId,
  neededOn,
  requirements,
  packs,
  suppliers,
  existingSuppliers,
  locale,
}: {
  planId: string;
  neededOn: string;
  requirements: MaterialAvailability[];
  packs: SupplierItem[];
  suppliers: Supplier[];
  existingSuppliers: string[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  const activePacks = packs.filter(
    (pack) => pack.active
      && suppliers.some((supplier) => supplier.active && supplier.id === pack.supplier_id),
  );
  const shortages = requirements.filter((requirement) => requirement.shortage > 0);
  const [selected, setSelected] = useState<Record<string, string>>(() => Object.fromEntries(
    shortages.map((requirement) => [
      requirement.ingredient_id,
      selectSupplierPack(
        activePacks.filter((pack) => pack.ingredient_id === requirement.ingredient_id),
      )?.id ?? '',
    ]),
  ));
  const selectedLines = shortages.flatMap((requirement) => {
    const pack = activePacks.find(
      (candidate) => candidate.id === selected[requirement.ingredient_id],
    );
    return pack && pack.pack_quantity_uom === requirement.uom
      ? [{ requirement, pack }]
      : [];
  });
  return (
    <>
      <div className="form-grid">
        {shortages.map((requirement) => {
          const options = activePacks.filter(
            (pack) => pack.ingredient_id === requirement.ingredient_id,
          );
          const chosen = options.find(
            (pack) => pack.id === selected[requirement.ingredient_id],
          );
          return (
            <label
              key={requirement.ingredient_id}
              htmlFor={`${prefix}-${requirement.ingredient_id}`}
            >
              {requirement.ingredient_name}
              <select
                id={`${prefix}-${requirement.ingredient_id}`}
                value={selected[requirement.ingredient_id] ?? ''}
                onChange={(event) => setSelected({
                  ...selected,
                  [requirement.ingredient_id]: event.target.value,
                })}
              >
                <option value="">
                  {es ? 'Seleccionar presentación' : 'Select supplier pack'}
                </option>
                {options.map((pack) => (
                  <option key={pack.id} value={pack.id}>
                    {suppliers.find((supplier) => supplier.id === pack.supplier_id)?.name}
                    {' · '}
                    {formatNumber(pack.pack_quantity)}
                    {' '}
                    {pack.pack_quantity_uom}
                    /
                    {pack.purchase_uom}
                  </option>
                ))}
              </select>
              {!options.length && (
                <small>
                  {es
                    ? 'Configura una presentación en el ingrediente.'
                    : 'Configure a supplier pack on the ingredient’s detail page.'}
                </small>
              )}
              {chosen && chosen.pack_quantity_uom !== requirement.uom && (
                <small role="alert">
                  {es
                    ? 'La presentación necesita una conversión validada a la unidad base.'
                    : 'This pack needs a validated conversion to the ingredient’s base unit.'}
                </small>
              )}
            </label>
          );
        })}
      </div>
      {suppliers
        .filter((supplier) => selectedLines.some((line) => line.pack.supplier_id === supplier.id))
        .map((supplier) => {
          const lines = selectedLines.filter(
            (line) => line.pack.supplier_id === supplier.id,
          );
          return (
            <section className="purchase-group" key={supplier.id}>
              <h3>{supplier.name}</h3>
              {existingSuppliers.includes(supplier.id) ? (
                <p className="notice">
                  {es
                    ? 'Ya existe una compra abierta para este proveedor. Revísala abajo.'
                    : 'An open purchase already exists for this supplier. Review it below.'}
                </p>
              ) : (
                <PurchasingForm
                  key={lines.map((line) => line.pack.id).join(',')}
                  operation="create-draft"
                  locale={locale}
                  label={
                    es
                      ? `Crear borrador para ${supplier.name}`
                      : `Create draft for ${supplier.name}`
                  }
                  payload={(form, requestId) => ({
                    id: requestId,
                    material_plan_id: planId,
                    supplier_id: supplier.id,
                    expected_on: form.get('expected_on'),
                    lines: lines.map(({ requirement, pack }) => ({
                      ingredient_id: requirement.ingredient_id,
                      supplier_item_id: pack.id,
                      purchase_units: Number(
                        form.get(`units-${requirement.ingredient_id}`),
                      ),
                      override_reason:
                        form.get(`reason-${requirement.ingredient_id}`) ?? '',
                    })),
                  })}
                >
                  <label htmlFor={`${prefix}-date-${supplier.id}`}>
                    {es ? 'Fecha prevista' : 'Expected delivery'}
                    <input
                      id={`${prefix}-date-${supplier.id}`}
                      name="expected_on"
                      type="date"
                      required
                      defaultValue={neededOn}
                    />
                  </label>
                  {lines.map(({ requirement, pack }) => {
                    const recommendation = recommendPurchase(
                      requirement.shortage,
                      pack.pack_quantity,
                    );
                    return (
                      <div className="purchase-line" key={requirement.ingredient_id}>
                        <strong>{requirement.ingredient_name}</strong>
                        <p>
                          {es ? 'Faltante' : 'Raw shortage'}
                          :
                          {' '}
                          {formatNumber(requirement.shortage)}
                          {' '}
                          {requirement.uom}
                          {' · '}
                          {es ? 'Recomendado' : 'Recommended'}
                          :
                          {recommendation.units}
                          {' '}
                          {pack.purchase_uom}
                          {' = '}
                          {formatNumber(recommendation.quantity)}
                          {' '}
                          {requirement.uom}
                          {' · '}
                          {es ? 'Excedente' : 'Pack overage'}
                          :
                          {' '}
                          {formatNumber(recommendation.overage)}
                          {' '}
                          {requirement.uom}
                        </p>
                        <div className="form-grid">
                          <label htmlFor={`${prefix}-units-${requirement.ingredient_id}`}>
                            {es ? 'Unidades de compra' : 'Purchase units'}
                            {' '}
                            (
                            {pack.purchase_uom}
                            )
                            <input
                              id={`${prefix}-units-${requirement.ingredient_id}`}
                              name={`units-${requirement.ingredient_id}`}
                              type="number"
                              min={1}
                              max={MAX_PURCHASE_UNITS}
                              step="1"
                              required
                              defaultValue={recommendation.units}
                            />
                          </label>
                          <label
                            htmlFor={`${prefix}-reason-${requirement.ingredient_id}`}
                          >
                            {es ? 'Motivo del ajuste' : 'Override reason'}
                            <input
                              id={`${prefix}-reason-${requirement.ingredient_id}`}
                              name={`reason-${requirement.ingredient_id}`}
                              maxLength={1000}
                            />
                          </label>
                        </div>
                      </div>
                    );
                  })}
                </PurchasingForm>
              )}
            </section>
          );
        })}
    </>
  );
}
