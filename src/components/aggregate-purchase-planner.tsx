'use client';

import { useId, useState } from 'react';
import type { DemandCoverage } from '@/domain/demand-coverage';
import { formatDate, formatNumber, QUANTITY_SCALE } from '@/domain/format';
import type { Supplier, SupplierItem } from '@/domain/master-data';
import {
  MAX_PURCHASE_UNITS,
  recommendPurchase,
  standalonePurchaseLines,
  type PurchasePlanningPrice,
} from '@/domain/purchasing';
import PurchaseCostEstimate from './purchase-cost-estimate';
import PurchasingForm from './purchasing-form';

interface Allocation {
  packId: string;
  units: string;
}

interface PlannedLine {
  coverage: DemandCoverage;
  pack: SupplierItem;
  units: number;
}

function allocationKey(ingredientId: string, supplierId: string) {
  return `${ingredientId}:${supplierId}`;
}

function wholeUnits(value: string) {
  const units = Number(value);
  return Number.isInteger(units) && units > 0 && units <= MAX_PURCHASE_UNITS
    ? units
    : 0;
}

/**
 * Plan aggregate shortages, split them across suppliers, then save one draft per supplier.
 */
export default function AggregatePurchasePlanner({
  coverage,
  suppliers,
  packs,
  supplierPrices,
  locale,
}: {
  coverage: DemandCoverage[];
  suppliers: Supplier[];
  packs: SupplierItem[];
  supplierPrices: PurchasePlanningPrice[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  const shortages = coverage.filter((line) => line.shortage > 0);
  const activeSuppliers = suppliers.filter((supplier) => supplier.active);
  const activeSupplierIds = new Set(activeSuppliers.map((supplier) => supplier.id));
  const activePacks = packs.filter(
    (pack) => pack.active && activeSupplierIds.has(pack.supplier_id),
  );
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [allocations, setAllocations] = useState<Record<string, Allocation>>({});
  const [expectedDates, setExpectedDates] = useState<Record<string, string>>({});
  const [reviewing, setReviewing] = useState(false);

  const compatiblePacks = (line: DemandCoverage, supplierId?: string) => activePacks.filter(
    (pack) => pack.ingredient_id === line.ingredientId
      && pack.pack_quantity_uom === line.uom
      && (!supplierId || pack.supplier_id === supplierId),
  );
  const defaultPack = (line: DemandCoverage, supplierId: string) => {
    const options = compatiblePacks(line, supplierId);
    return options.find((pack) => pack.is_preferred) ?? options[0];
  };
  const plannedLines: PlannedLine[] = shortages.flatMap((line) => {
    if (!selected[line.ingredientId]) return [];
    return activeSuppliers.flatMap((supplier) => {
      const allocation = allocations[allocationKey(line.ingredientId, supplier.id)];
      const pack = allocation
        ? compatiblePacks(line, supplier.id).find((candidate) => candidate.id === allocation.packId)
        : undefined;
      const units = allocation ? wholeUnits(allocation.units) : 0;
      return pack && units > 0 ? [{ coverage: line, pack, units }] : [];
    });
  });
  const plannedQuantity = (ingredientId: string) => plannedLines
    .filter((line) => line.coverage.ingredientId === ingredientId)
    .reduce((total, line) => (
      total + Math.round(line.pack.pack_quantity * QUANTITY_SCALE) * line.units
    ), 0) / QUANTITY_SCALE;
  const supplierIds = activeSuppliers
    .filter((supplier) => plannedLines.some((line) => line.pack.supplier_id === supplier.id))
    .map((supplier) => supplier.id);
  const selectedCount = shortages.filter((line) => selected[line.ingredientId]).length;
  const selectedIngredientLabel = es
    ? 'ingrediente(s) seleccionado(s)'
    : 'ingredient(s) selected';
  const plannedSupplierLabel = es ? 'proveedor(es) en el plan' : 'supplier(s) in plan';
  let selectionStatus = es
    ? 'Selecciona al menos un ingrediente para comenzar.'
    : 'Select at least one ingredient to begin.';
  if (selectedCount > 0) {
    selectionStatus = `${selectedCount} ${selectedIngredientLabel} · ${supplierIds.length} ${plannedSupplierLabel}`;
  }

  if (!shortages.length) {
    return (
      <p className="notice">
        {es
          ? 'La demanda acumulada de los pedidos abiertos está cubierta.'
          : 'Aggregate demand for open orders is covered.'}
      </p>
    );
  }

  if (reviewing) {
    return (
      <section className="purchase-group">
        <div className="section-heading">
          <div>
            <h2>{es ? 'Resumen antes de ordenar' : 'Review before ordering'}</h2>
            <p>
              {es
                ? 'Se creará un borrador separado para cada proveedor. Un borrador no realiza el pedido.'
                : 'A separate draft will be created for each supplier. Creating a draft does not place the order.'}
            </p>
          </div>
          <button type="button" className="secondary" onClick={() => setReviewing(false)}>
            {es ? 'Volver a asignaciones' : 'Back to allocations'}
          </button>
        </div>
        {activeSuppliers.filter((supplier) => supplierIds.includes(supplier.id)).map((supplier) => {
          const lines = plannedLines.filter((line) => line.pack.supplier_id === supplier.id);
          const suggestedDate = lines.map((line) => line.coverage.neededOn).sort()[0] ?? '';
          const expectedOn = expectedDates[supplier.id] ?? suggestedDate;
          const supplierPacks = lines.map((line) => line.pack);
          return (
            <section className="purchase-group" key={supplier.id}>
              <h3>{supplier.name}</h3>
              <div className="table-wrap">
                <table>
                  <caption>{es ? 'Ingredientes asignados' : 'Assigned ingredients'}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{es ? 'Ingrediente' : 'Ingredient'}</th>
                      <th scope="col">{es ? 'Presentación' : 'Pack'}</th>
                      <th scope="col">{es ? 'Cantidad base' : 'Base quantity'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => (
                      <tr key={line.coverage.ingredientId}>
                        <th scope="row">{line.coverage.name}</th>
                        <td>{`${line.units} ${line.pack.purchase_uom} × ${formatNumber(line.pack.pack_quantity)} ${line.pack.pack_quantity_uom}`}</td>
                        <td>{`${formatNumber(line.units * line.pack.pack_quantity)} ${line.coverage.uom}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              <PurchasingForm
                operation="create-draft"
                locale={locale}
                label={es
                  ? `Crear borrador para ${supplier.name}`
                  : `Create draft for ${supplier.name}`}
                payload={(form, requestId) => {
                  const submittedReason = form.get('reason');
                  const reason = typeof submittedReason === 'string' ? submittedReason : '';
                  return {
                    id: requestId,
                    kind: 'standalone' as const,
                    supplier_id: supplier.id,
                    expected_on: form.get('expected_on'),
                    lines: standalonePurchaseLines(
                      supplierPacks,
                      Object.fromEntries(lines.map((line) => [
                        line.coverage.ingredientId,
                        line.units,
                      ])),
                      Object.fromEntries(lines.map((line) => [
                        line.coverage.ingredientId,
                        line.pack.id,
                      ])),
                      reason,
                    ),
                  };
                }}
              >
                <div className="form-grid">
                  <label htmlFor={`${prefix}-date-${supplier.id}`}>
                    {es ? 'Fecha prevista' : 'Expected delivery'}
                    <input
                      id={`${prefix}-date-${supplier.id}`}
                      name="expected_on"
                      type="date"
                      required
                      value={expectedOn}
                      onChange={(event) => setExpectedDates((current) => ({
                        ...current,
                        [supplier.id]: event.target.value,
                      }))}
                    />
                  </label>
                  <label htmlFor={`${prefix}-reason-${supplier.id}`}>
                    {es ? 'Motivo de compra (opcional)' : 'Purchase reason (optional)'}
                    <input
                      id={`${prefix}-reason-${supplier.id}`}
                      name="reason"
                      maxLength={1000}
                    />
                  </label>
                </div>
                <PurchaseCostEstimate
                  items={lines.map((line) => ({
                    id: line.coverage.ingredientId,
                    label: line.coverage.name,
                    supplierItemId: line.pack.id,
                    purchaseUom: line.pack.purchase_uom,
                    purchaseUnits: line.units,
                  }))}
                  prices={supplierPrices}
                  expectedOn={expectedOn}
                  locale={locale}
                />
              </PurchasingForm>
            </section>
          );
        })}
      </section>
    );
  }

  return (
    <section className="purchase-group">
      <h2>{es ? 'Compra para todos los pedidos abiertos' : 'Purchase for all open orders'}</h2>
      <p>
        {es
          ? 'Selecciona los faltantes que deseas comprar y reparte las presentaciones entre uno o más proveedores.'
          : 'Check the shortages you want to buy, then split whole packs across one or more suppliers.'}
      </p>
      <div className="table-wrap">
        <table>
          <caption>{es ? 'Cobertura acumulada de ingredientes' : 'Aggregate ingredient coverage'}</caption>
          <thead>
            <tr>
              <th scope="col">{es ? 'Comprar' : 'Buy'}</th>
              <th scope="col">{es ? 'Ingrediente' : 'Ingredient'}</th>
              <th scope="col">{es ? 'Demanda total' : 'Total demand'}</th>
              <th scope="col">{es ? 'Disponible' : 'On hand'}</th>
              <th scope="col">{es ? 'Entradas' : 'Inbound'}</th>
              <th scope="col">{es ? 'Faltante' : 'Shortage'}</th>
              <th scope="col">{es ? 'Planificado' : 'Planned'}</th>
              <th scope="col">{es ? 'Restante' : 'Remaining'}</th>
            </tr>
          </thead>
          <tbody>
            {shortages.map((line) => {
              const isSelected = selected[line.ingredientId] ?? false;
              const available = compatiblePacks(line);
              const planned = plannedQuantity(line.ingredientId);
              const remaining = Math.max(0, line.shortage - planned);
              return (
                <tr key={line.ingredientId}>
                  <td>
                    <input
                      aria-label={`${es ? 'Comprar' : 'Buy'} ${line.name}`}
                      type="checkbox"
                      checked={isSelected}
                      disabled={!available.length}
                      onChange={(event) => {
                        const { checked } = event.target;
                        setSelected((current) => ({ ...current, [line.ingredientId]: checked }));
                        if (!checked) return;
                        const preferred = available.find((pack) => pack.is_preferred)
                          ?? available[0];
                        if (!preferred) return;
                        const key = allocationKey(line.ingredientId, preferred.supplier_id);
                        setAllocations((current) => {
                          if (current[key]) return current;
                          return {
                            ...current,
                            [key]: {
                              packId: preferred.id,
                              units: String(recommendPurchase(
                                line.shortage,
                                preferred.pack_quantity,
                              ).units),
                            },
                          };
                        });
                      }}
                    />
                  </td>
                  <th scope="row">
                    {line.name}
                    {!available.length && (
                      <small>
                        {' · '}
                        {es ? 'Sin presentación compatible' : 'No compatible supplier pack'}
                      </small>
                    )}
                  </th>
                  <td>{`${formatNumber(line.demand)} ${line.uom}`}</td>
                  <td>{`${formatNumber(line.usable)} ${line.uom}`}</td>
                  <td>{`${formatNumber(line.inbound)} ${line.uom}`}</td>
                  <td>{`${formatNumber(line.shortage)} ${line.uom}`}</td>
                  <td>{`${formatNumber(planned)} ${line.uom}`}</td>
                  <td>{`${formatNumber(remaining)} ${line.uom}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      {shortages.filter((line) => selected[line.ingredientId]).map((line) => (
        <fieldset className="purchase-line" key={line.ingredientId}>
          <legend>{line.name}</legend>
          <p>
            {`${es ? 'Faltan' : 'Short'} ${formatNumber(line.shortage)} ${line.uom} · ${es ? 'se necesita desde' : 'needed from'} ${formatDate(line.neededOn)}`}
          </p>
          {activeSuppliers.map((supplier) => {
            const options = compatiblePacks(line, supplier.id);
            if (!options.length) return null;
            const key = allocationKey(line.ingredientId, supplier.id);
            const allocation = allocations[key];
            const chosen = options.find((pack) => pack.id === allocation?.packId)
              ?? defaultPack(line, supplier.id);
            if (!chosen) return null;
            return (
              <div className="form-grid" key={supplier.id}>
                <label htmlFor={`${prefix}-pack-${line.ingredientId}-${supplier.id}`}>
                  {supplier.name}
                  <select
                    id={`${prefix}-pack-${line.ingredientId}-${supplier.id}`}
                    value={chosen.id}
                    onChange={(event) => setAllocations((current) => ({
                      ...current,
                      [key]: {
                        packId: event.target.value,
                        units: current[key]?.units ?? '0',
                      },
                    }))}
                  >
                    {options.map((pack) => (
                      <option value={pack.id} key={pack.id}>
                        {`${formatNumber(pack.pack_quantity)} ${pack.pack_quantity_uom}/${pack.purchase_uom}${pack.supplier_sku ? ` · ${pack.supplier_sku}` : ''}`}
                      </option>
                    ))}
                  </select>
                </label>
                <label htmlFor={`${prefix}-units-${line.ingredientId}-${supplier.id}`}>
                  {`${es ? 'Presentaciones completas' : 'Whole packs'} (${chosen.purchase_uom})`}
                  <input
                    id={`${prefix}-units-${line.ingredientId}-${supplier.id}`}
                    type="number"
                    min={0}
                    max={MAX_PURCHASE_UNITS}
                    step="1"
                    value={allocation?.units ?? '0'}
                    onChange={(event) => setAllocations((current) => ({
                      ...current,
                      [key]: { packId: chosen.id, units: event.target.value },
                    }))}
                  />
                  <small>
                    {`${es ? 'Aporta' : 'Adds'} ${formatNumber(wholeUnits(allocation?.units ?? '0') * chosen.pack_quantity)} ${line.uom}`}
                  </small>
                </label>
              </div>
            );
          })}
        </fieldset>
      ))}
      <p className="notice" aria-live="polite">
        {selectionStatus}
      </p>
      <button
        type="button"
        disabled={!plannedLines.length}
        onClick={() => setReviewing(true)}
      >
        {es ? 'Revisar antes de ordenar' : 'Review before ordering'}
      </button>
    </section>
  );
}
