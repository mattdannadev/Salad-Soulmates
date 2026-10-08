'use client';

import { useId, useState } from 'react';
import type { Supplier, SupplierItem } from '@/domain/master-data';
import {
  type MaterialAvailability,
  type PurchasePlanningPrice,
  recommendPurchase,
  selectSupplierPack,
  MAX_PURCHASE_UNITS,
} from '@/domain/purchasing';
import { formatNumber, QUANTITY_SCALE } from '@/domain/format';
import PurchasingForm from './purchasing-form';
import PurchaseCostEstimate from './purchase-cost-estimate';
import SupplierPackQuickAdd from './supplier-pack-quick-add';

export function parsePurchaseUnits(value: string): number | null {
  const units = Number(value);
  return Number.isInteger(units) && units >= 1 && units <= MAX_PURCHASE_UNITS
    ? units
    : null;
}

export function purchaseOverrideReason(
  orderUnits: number,
  recommendedUnits: number,
  reason: string | null,
) {
  return orderUnits === recommendedUnits ? '' : (reason ?? '').trim();
}

export function calculatePurchaseAdjustment(
  shortage: number,
  packQuantity: number,
  orderUnits: number | null,
) {
  if (orderUnits === null) return null;
  const orderedTicks = Math.round(packQuantity * QUANTITY_SCALE) * orderUnits;
  if (!Number.isSafeInteger(orderedTicks)) return null;
  const shortageTicks = Math.round(shortage * QUANTITY_SCALE);
  return {
    orderedQuantity: orderedTicks / QUANTITY_SCALE,
    difference: (orderedTicks - shortageTicks) / QUANTITY_SCALE,
  };
}

function purchaseDifferenceLabel(difference: number, uom: string, es: boolean) {
  if (difference === 0) {
    return es ? 'Cubre exactamente el faltante base' : 'Matches the raw shortage';
  }
  let direction = es ? 'por encima del faltante base' : 'over the raw shortage';
  if (difference < 0) {
    direction = es ? 'por debajo del faltante base' : 'under the raw shortage';
  }
  return `${formatNumber(Math.abs(difference))} ${uom} ${direction}`;
}

function ingredientCountLabel(count: number, es: boolean) {
  if (count === 1) return es ? 'ingrediente' : 'ingredient';
  return es ? 'ingredientes' : 'ingredients';
}

export default function PurchaseComposer({
  planId,
  neededOn,
  requirements,
  packs,
  suppliers,
  existingSuppliers,
  supplierPrices,
  locale,
}: {
  planId: string;
  neededOn: string;
  requirements: MaterialAvailability[];
  packs: SupplierItem[];
  suppliers: Supplier[];
  existingSuppliers: string[];
  supplierPrices: PurchasePlanningPrice[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  const [availablePacks, setAvailablePacks] = useState(packs);
  const activePacks = availablePacks.filter(
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
  const [includedIngredients, setIncludedIngredients] = useState<Record<string, boolean>>(() => (
    Object.fromEntries(shortages.map((requirement) => [requirement.ingredient_id, true]))
  ));
  const [purchaseUnits, setPurchaseUnits] = useState<Record<string, string>>(() => (
    Object.fromEntries(shortages.flatMap((requirement) => {
      const pack = selectSupplierPack(
        activePacks.filter((candidate) => candidate.ingredient_id === requirement.ingredient_id),
      );
      return pack && pack.pack_quantity_uom === requirement.uom
        ? [[requirement.ingredient_id, String(recommendPurchase(
          requirement.shortage,
          pack.pack_quantity,
        ).units)]]
        : [];
    }))
  ));
  const [expectedDates, setExpectedDates] = useState<Record<string, string>>(() => (
    Object.fromEntries(suppliers.map((supplier) => [supplier.id, neededOn]))
  ));
  const [overrideReasons, setOverrideReasons] = useState<Record<string, string>>({});
  const [activeSupplierId, setActiveSupplierId] = useState<string | null>(null);
  const selectedLines = shortages.flatMap((requirement) => {
    if (!includedIngredients[requirement.ingredient_id]) return [];
    const pack = activePacks.find(
      (candidate) => candidate.id === selected[requirement.ingredient_id],
    );
    return pack && pack.pack_quantity_uom === requirement.uom
      ? [{ requirement, pack }]
      : [];
  });
  const supplierIds = suppliers
    .filter((supplier) => selectedLines.some((line) => line.pack.supplier_id === supplier.id))
    .map((supplier) => supplier.id);
  const visibleSupplierId = activeSupplierId ?? supplierIds[0] ?? null;
  return (
    <>
      <section className="purchase-group">
        <h3>{es ? '1. Elige los ingredientes para comprar' : '1. Select ingredients to buy'}</h3>
        <p>{es ? 'Desmarca un ingrediente para excluirlo de estas órdenes de compra.' : 'Clear an ingredient to exclude it from these purchase orders.'}</p>
        <div className="form-grid">
          {shortages.map((requirement) => (
            <label className="check" key={requirement.ingredient_id}>
              <input
                type="checkbox"
                checked={includedIngredients[requirement.ingredient_id] ?? false}
                onChange={(event) => setIncludedIngredients((current) => ({
                  ...current,
                  [requirement.ingredient_id]: event.target.checked,
                }))}
              />
              <span>
                <strong>{requirement.ingredient_name}</strong>
                <small>{`${es ? 'Faltante' : 'Shortage'}: ${formatNumber(requirement.shortage)} ${requirement.uom}`}</small>
              </span>
            </label>
          ))}
        </div>
      </section>
      <section className="purchase-group">
        <h3>{es ? '2. Revisa las recomendaciones por proveedor' : '2. Review supplier recommendations'}</h3>
        <p>{es ? 'Elige un proveedor para revisar ingredientes, cantidades y datos de contacto antes de crear un borrador.' : 'Choose a supplier to review ingredients, quantities, and contact details before creating a draft.'}</p>
        <div className="page-heading-actions" aria-label={es ? 'Proveedores para revisar' : 'Suppliers to review'}>
          {suppliers.filter((supplier) => supplierIds.includes(supplier.id)).map((supplier) => {
            const lineCount = selectedLines.filter(
              (line) => line.pack.supplier_id === supplier.id,
            ).length;
            return (
              <button
                type="button"
                className={visibleSupplierId === supplier.id ? 'button button--compact' : 'button secondary button--compact'}
                aria-pressed={visibleSupplierId === supplier.id}
                key={supplier.id}
                onClick={() => setActiveSupplierId(supplier.id)}
              >
                {supplier.name}
                {' · '}
                {lineCount}
                {' '}
                {ingredientCountLabel(lineCount, es)}
              </button>
            );
          })}
        </div>
      </section>
      <details className="purchase-group">
        <summary>{es ? '3. Cambiar recomendaciones de proveedor o presentación' : '3. Change supplier or pack recommendations'}</summary>
        <p>{es ? 'Úsalo solo para mover un ingrediente a otro proveedor o cambiar su presentación.' : 'Use this only to move an ingredient to another supplier or change its pack.'}</p>
        <h3>{es ? 'Presentaciones disponibles por proveedor' : 'Available packs by supplier'}</h3>
        {suppliers.filter((supplier) => supplier.active).map((supplier) => {
          const offerings = activePacks.filter((pack) => pack.supplier_id === supplier.id
            && selectedLines.some((line) => line.requirement.ingredient_id === pack.ingredient_id));
          if (!offerings.length) return null;
          return (
            <details key={supplier.id}>
              <summary>
                {supplier.name}
                {' '}
                ·
                {' '}
                {offerings.length}
                {' '}
                {es ? 'presentaciones' : 'packs'}
              </summary>
              <ul>
                {offerings.map((pack) => {
                  const requirement = shortages.find(
                    (item) => item.ingredient_id === pack.ingredient_id,
                  );
                  return (
                    <li key={pack.id}>
                      {requirement?.ingredient_name}
                      {' '}
                      ·
                      {' '}
                      {formatNumber(pack.pack_quantity)}
                      {' '}
                      {pack.pack_quantity_uom}
                      /
                      {pack.purchase_uom}
                      {pack.supplier_sku ? ` · ${pack.supplier_sku}` : ''}
                    </li>
                  );
                })}
              </ul>
            </details>
          );
        })}
      </details>
      <details className="purchase-group">
        <summary>{es ? 'Asignar o cambiar ingredientes' : 'Assign or change ingredients'}</summary>
        <div className="form-grid">
          {shortages
            .filter((requirement) => includedIngredients[requirement.ingredient_id])
            .map((requirement) => {
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
                    onChange={(event) => {
                      const supplierItemId = event.target.value;
                      const nextPack = activePacks.find((pack) => pack.id === supplierItemId);
                      setSelected({ ...selected, [requirement.ingredient_id]: supplierItemId });
                      if (nextPack && nextPack.pack_quantity_uom === requirement.uom) {
                        setPurchaseUnits({
                          ...purchaseUnits,
                          [requirement.ingredient_id]: String(recommendPurchase(
                            requirement.shortage,
                            nextPack.pack_quantity,
                          ).units),
                        });
                        setOverrideReasons({
                          ...overrideReasons,
                          [requirement.ingredient_id]: '',
                        });
                      }
                    }}
                  >
                    <option value="">
                      {es ? 'Seleccionar presentación' : 'Select supplier pack'}
                    </option>
                    {suppliers.map((supplier) => {
                      const supplierOptions = options.filter(
                        (pack) => pack.supplier_id === supplier.id,
                      );
                      if (!supplierOptions.length) return null;
                      return (
                        <optgroup key={supplier.id} label={supplier.name}>
                          {supplierOptions.map((pack) => (
                            <option key={pack.id} value={pack.id}>
                              {formatNumber(pack.pack_quantity)}
                              {' '}
                              {pack.pack_quantity_uom}
                              /
                              {pack.purchase_uom}
                              {pack.supplier_sku ? ` · ${pack.supplier_sku}` : ''}
                            </option>
                          ))}
                        </optgroup>
                      );
                    })}
                  </select>
                  {!options.length && <small>{es ? 'Agrega una presentación para continuar.' : 'Add a supplier pack to continue.'}</small>}
                  <SupplierPackQuickAdd
                    ingredientId={requirement.ingredient_id}
                    ingredientName={requirement.ingredient_name}
                    inventoryUom={requirement.uom}
                    suppliers={suppliers}
                    locale={locale}
                    onCreated={(pack) => {
                      setAvailablePacks((current) => [...current, pack]);
                      setSelected((current) => ({
                        ...current,
                        [requirement.ingredient_id]: pack.id,
                      }));
                      setPurchaseUnits((current) => ({
                        ...current,
                        [requirement.ingredient_id]: String(recommendPurchase(
                          requirement.shortage,
                          pack.pack_quantity,
                        ).units),
                      }));
                      setOverrideReasons((current) => ({
                        ...current,
                        [requirement.ingredient_id]: '',
                      }));
                    }}
                  />
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
      </details>
      {suppliers
        .filter((supplier) => supplier.id === visibleSupplierId)
        .map((supplier) => {
          const lines = selectedLines.filter(
            (line) => line.pack.supplier_id === supplier.id,
          );
          return (
            <section className="purchase-group" key={supplier.id}>
              <h3>{supplier.name}</h3>
              <p className="muted-text">
                <strong>{es ? 'Contacto de compras' : 'Purchasing contact'}</strong>
                {': '}
                {[supplier.contact_name, supplier.email, supplier.phone].filter(Boolean).join(' · ') || (es ? 'No registrado' : 'Not recorded')}
                {supplier.lead_time_days !== null
                  ? ` · ${supplier.lead_time_days} ${es ? 'días de entrega' : 'day lead time'}`
                  : ''}
              </p>
              {existingSuppliers.includes(supplier.id) ? (
                <p className="notice">
                  {es
                    ? 'Ya existe una compra abierta para este proveedor. Revísala abajo.'
                    : 'An open purchase already exists for this supplier. Review it below.'}
                </p>
              ) : (
                <>
                  <p>
                    {es
                      ? 'Revisa y ajusta las cantidades antes de crear el borrador. El borrador no realiza el pedido al proveedor.'
                      : 'Review and adjust quantities before creating the draft. The draft does not place the order with the supplier.'}
                  </p>
                  <PurchasingForm
                    key={lines.map((line) => line.pack.id).join(',')}
                    operation="create-draft"
                    locale={locale}
                    label={
                      es
                        ? `Crear borrador de compra para ${supplier.name}`
                        : `Create purchase draft for ${supplier.name}`
                    }
                    payload={(form, requestId) => ({
                      id: requestId,
                      kind: 'order' as const,
                      material_plan_id: planId,
                      supplier_id: supplier.id,
                      expected_on: form.get('expected_on'),
                      lines: lines.map(({ requirement, pack }) => {
                        const units = Number(
                          form.get(`units-${requirement.ingredient_id}`),
                        );
                        const recommendedUnits = recommendPurchase(
                          requirement.shortage,
                          pack.pack_quantity,
                        ).units;
                        const reason = form.get(`reason-${requirement.ingredient_id}`);
                        return {
                          ingredient_id: requirement.ingredient_id,
                          supplier_item_id: pack.id,
                          purchase_units: units,
                          override_reason: purchaseOverrideReason(
                            units,
                            recommendedUnits,
                            typeof reason === 'string' ? reason : null,
                          ),
                        };
                      }),
                    })}
                  >
                    <label htmlFor={`${prefix}-date-${supplier.id}`}>
                      {es ? 'Fecha prevista' : 'Expected delivery'}
                      <input
                        id={`${prefix}-date-${supplier.id}`}
                        name="expected_on"
                        type="date"
                        required
                        value={expectedDates[supplier.id] ?? neededOn}
                        onChange={(event) => setExpectedDates({
                          ...expectedDates,
                          [supplier.id]: event.target.value,
                        })}
                      />
                    </label>
                    {lines.map(({ requirement, pack }) => {
                      const recommendation = recommendPurchase(
                        requirement.shortage,
                        pack.pack_quantity,
                      );
                      const orderUnitsValue = purchaseUnits[requirement.ingredient_id]
                        ?? String(recommendation.units);
                      const orderUnits = parsePurchaseUnits(orderUnitsValue);
                      const adjustment = calculatePurchaseAdjustment(
                        requirement.shortage,
                        pack.pack_quantity,
                        orderUnits,
                      );
                      const isOverride = orderUnits !== null
                        && orderUnits !== recommendation.units;
                      const reasonMessageId = `${prefix}-reason-message-${requirement.ingredient_id}`;
                      return (
                        <div className="purchase-line" key={requirement.ingredient_id}>
                          <strong>{requirement.ingredient_name}</strong>
                          <p>
                            {es ? 'Requerido' : 'Required'}
                            :
                            {' '}
                            {formatNumber(requirement.required)}
                            {' '}
                            {requirement.uom}
                            {' · '}
                            {es ? 'Existencias' : 'On hand'}
                            :
                            {' '}
                            {formatNumber(requirement.on_hand)}
                            {' '}
                            {requirement.uom}
                            {' · '}
                            {es ? 'Entrada confirmada' : 'Confirmed inbound'}
                            :
                            {' '}
                            {formatNumber(requirement.confirmed_inbound)}
                            {' '}
                            {requirement.uom}
                            {' · '}
                            {es ? 'Faltante base' : 'Raw shortage'}
                            :
                            {' '}
                            {formatNumber(requirement.shortage)}
                            {' '}
                            {requirement.uom}
                          </p>
                          <p>
                            {es ? 'Cantidad recomendada' : 'Recommended quantity'}
                            :
                            {' '}
                            {recommendation.units}
                            {' '}
                            {pack.purchase_uom}
                            {' = '}
                            {formatNumber(recommendation.quantity)}
                            {' '}
                            {requirement.uom}
                          </p>
                          <div className="form-grid">
                            <label htmlFor={`${prefix}-units-${requirement.ingredient_id}`}>
                              {es ? 'Pedir ahora' : 'Order now'}
                              {' '}
                              (
                              {pack.purchase_uom}
                              )
                              <input
                                id={`${prefix}-units-${requirement.ingredient_id}`}
                                name={`units-${requirement.ingredient_id}`}
                                aria-label={`${requirement.ingredient_name} · ${
                                  es ? 'Pedir ahora' : 'Order now'
                                } (${pack.purchase_uom})`}
                                type="number"
                                min={1}
                                max={MAX_PURCHASE_UNITS}
                                step="1"
                                required
                                value={orderUnitsValue}
                                onChange={(event) => {
                                  const nextValue = event.target.value;
                                  setPurchaseUnits({
                                    ...purchaseUnits,
                                    [requirement.ingredient_id]: nextValue,
                                  });
                                  if (parsePurchaseUnits(nextValue) === recommendation.units) {
                                    setOverrideReasons({
                                      ...overrideReasons,
                                      [requirement.ingredient_id]: '',
                                    });
                                  }
                                }}
                              />
                            </label>
                            <label
                              htmlFor={`${prefix}-reason-${requirement.ingredient_id}`}
                            >
                              {es ? 'Motivo del ajuste' : 'Override reason'}
                              <input
                                id={`${prefix}-reason-${requirement.ingredient_id}`}
                                name={`reason-${requirement.ingredient_id}`}
                                aria-label={`${requirement.ingredient_name} · ${
                                  es ? 'Motivo del ajuste' : 'Override reason'
                                }`}
                                value={overrideReasons[requirement.ingredient_id] ?? ''}
                                onChange={(event) => setOverrideReasons({
                                  ...overrideReasons,
                                  [requirement.ingredient_id]: event.target.value,
                                })}
                                minLength={3}
                                maxLength={1000}
                                pattern="\s*\S.{1,}\S\s*"
                                required={isOverride}
                                aria-describedby={isOverride ? reasonMessageId : undefined}
                              />
                              {isOverride && (
                                <small id={reasonMessageId}>
                                  {es
                                    ? 'Explica por qué Pedir ahora difiere de la cantidad recomendada. Usa al menos 3 caracteres sin contar espacios al inicio o al final.'
                                    : 'Explain why Order now differs from the recommended quantity. Use at least 3 characters, excluding leading or trailing spaces.'}
                                </small>
                              )}
                            </label>
                          </div>
                          {adjustment ? (
                            <p aria-live="polite">
                              {es ? 'Cantidad base pedida' : 'Ordered base quantity'}
                              :
                              {' '}
                              {formatNumber(adjustment.orderedQuantity)}
                              {' '}
                              {requirement.uom}
                              {' · '}
                              {purchaseDifferenceLabel(
                                adjustment.difference,
                                requirement.uom,
                                es,
                              )}
                            </p>
                          ) : (
                            <p className="notice" aria-live="polite">
                              {es
                                ? 'Ingresa un número entero válido de presentaciones para revisar la cantidad base.'
                                : 'Enter a valid whole-pack quantity to review the ordered base quantity.'}
                            </p>
                          )}
                        </div>
                      );
                    })}
                    <PurchaseCostEstimate
                      items={lines.map(({ requirement, pack }) => ({
                        id: requirement.ingredient_id,
                        label: requirement.ingredient_name,
                        supplierItemId: pack.id,
                        purchaseUom: pack.purchase_uom,
                        purchaseUnits: parsePurchaseUnits(
                          purchaseUnits[requirement.ingredient_id]
                          ?? String(recommendPurchase(
                            requirement.shortage,
                            pack.pack_quantity,
                          ).units),
                        ) ?? 0,
                      }))}
                      prices={supplierPrices}
                      expectedOn={expectedDates[supplier.id] ?? neededOn}
                      locale={locale}
                    />
                  </PurchasingForm>
                </>
              )}
            </section>
          );
        })}
    </>
  );
}
