'use client';

import { useId, useState } from 'react';
import type { Ingredient, Supplier, SupplierItem } from '@/domain/master-data';
import {
  MAX_PURCHASE_UNITS,
  standalonePurchaseLines,
  type PurchasePlanningPrice,
} from '@/domain/purchasing';
import { formatNumber } from '@/domain/format';
import PurchasingForm from './purchasing-form';
import PurchaseCostEstimate from './purchase-cost-estimate';

/** Creates a manual supplier purchase that is intentionally independent of customer demand. */
export default function StandalonePurchaseComposer({
  suppliers, packs, ingredients, supplierPrices, locale,
}: {
  suppliers: Supplier[];
  packs: SupplierItem[];
  ingredients: Ingredient[];
  supplierPrices: PurchasePlanningPrice[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  const ingredientNames = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient.name]),
  );
  const selectionKey = (supplierId: string, ingredientId: string) => (
    `${supplierId}:${ingredientId}`
  );
  const [selectedPacks, setSelectedPacks] = useState<Record<string, string>>(() => (
    Object.fromEntries(suppliers.flatMap((supplier) => ingredients.flatMap((ingredient) => {
      const ingredientPacks = packs.filter((pack) => pack.active
        && pack.supplier_id === supplier.id && pack.ingredient_id === ingredient.id);
      const selectedPack = ingredientPacks.find((pack) => pack.is_preferred)
        ?? ingredientPacks[0];
      return selectedPack
        ? [[selectionKey(supplier.id, ingredient.id), selectedPack.id]]
        : [];
    })))
  ));
  const [purchaseUnits, setPurchaseUnits] = useState<Record<string, number>>({});
  const [expectedDates, setExpectedDates] = useState<Record<string, string>>({});
  return suppliers.filter((supplier) => supplier.active).map((supplier) => {
    const supplierPacks = packs.filter((pack) => pack.active && pack.supplier_id === supplier.id
      && ingredientNames.has(pack.ingredient_id));
    const supplierIngredients = ingredients.flatMap((ingredient) => {
      const ingredientPacks = supplierPacks.filter(
        (pack) => pack.ingredient_id === ingredient.id,
      );
      return ingredientPacks.length ? [{ ingredient, packs: ingredientPacks }] : [];
    });
    if (!supplierPacks.length) return null;
    return (
      <section className="purchase-group" key={supplier.id}>
        <h3>{supplier.name}</h3>
        <p>
          {es ? 'Escribe las presentaciones completas que deseas pedir. No se vincula a un pedido de cliente.' : 'Enter the whole packs you need. This is not linked to a customer order.'}
        </p>
        <PurchasingForm
          operation="create-draft"
          locale={locale}
          label={es ? 'Crear orden de compra' : 'Create purchase order'}
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
                Object.fromEntries(supplierIngredients.map(({ ingredient }) => [
                  ingredient.id,
                  Number(form.get(`units-${ingredient.id}`)),
                ])),
                Object.fromEntries(supplierIngredients.map(({ ingredient }) => {
                  const submittedPack = form.get(`pack-${ingredient.id}`);
                  return [
                    ingredient.id,
                    typeof submittedPack === 'string' ? submittedPack : undefined,
                  ];
                })),
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
                value={expectedDates[supplier.id] ?? ''}
                onChange={(event) => setExpectedDates({
                  ...expectedDates,
                  [supplier.id]: event.target.value,
                })}
              />
            </label>
            <label htmlFor={`${prefix}-reason-${supplier.id}`}>
              {es ? 'Motivo de compra (opcional)' : 'Purchase reason (optional)'}
              <input id={`${prefix}-reason-${supplier.id}`} name="reason" maxLength={1000} />
            </label>
          </div>
          {supplierIngredients.map(({ ingredient, packs: ingredientPacks }) => {
            const wholePacksLabel = es
              ? 'Presentaciones completas (0 omite este ingrediente)'
              : 'Whole packs (0 skips this ingredient)';
            const solePack = ingredientPacks.length === 1 ? ingredientPacks[0] : undefined;
            const quantityLabel = solePack
              ? `${formatNumber(solePack.pack_quantity)} ${solePack.pack_quantity_uom}/${solePack.purchase_uom} · ${wholePacksLabel}`
              : wholePacksLabel;
            return (
              <fieldset className="purchase-line" key={ingredient.id}>
                <legend>{ingredient.name}</legend>
                {ingredientPacks.length > 1 && (
                  <label htmlFor={`${prefix}-pack-${supplier.id}-${ingredient.id}`}>
                    {es ? 'Presentación del proveedor' : 'Supplier pack'}
                    <select
                      id={`${prefix}-pack-${supplier.id}-${ingredient.id}`}
                      name={`pack-${ingredient.id}`}
                      value={selectedPacks[selectionKey(supplier.id, ingredient.id)] ?? ''}
                      onChange={(event) => setSelectedPacks({
                        ...selectedPacks,
                        [selectionKey(supplier.id, ingredient.id)]: event.target.value,
                      })}
                    >
                      {ingredientPacks.map((pack) => (
                        <option value={pack.id} key={pack.id}>
                          {`${formatNumber(pack.pack_quantity)} ${pack.pack_quantity_uom}/${pack.purchase_uom}`}
                        </option>
                      ))}
                    </select>
                  </label>
                )}
                <label htmlFor={`${prefix}-units-${supplier.id}-${ingredient.id}`}>
                  {quantityLabel}
                  <input
                    id={`${prefix}-units-${supplier.id}-${ingredient.id}`}
                    name={`units-${ingredient.id}`}
                    type="number"
                    min={0}
                    max={MAX_PURCHASE_UNITS}
                    step="1"
                    value={purchaseUnits[selectionKey(supplier.id, ingredient.id)] ?? 0}
                    onChange={(event) => setPurchaseUnits({
                      ...purchaseUnits,
                      [selectionKey(supplier.id, ingredient.id)]: Number(event.target.value),
                    })}
                  />
                </label>
              </fieldset>
            );
          })}
          <PurchaseCostEstimate
            items={supplierIngredients.flatMap(({ ingredient, packs: ingredientPacks }) => {
              const supplierItemId = selectedPacks[
                selectionKey(supplier.id, ingredient.id)
              ] ?? ingredientPacks[0]?.id;
              return supplierItemId ? [{
                id: ingredient.id,
                label: ingredient.name,
                supplierItemId,
                purchaseUom: ingredientPacks.find((pack) => pack.id === supplierItemId)
                  ?.purchase_uom ?? '',
                purchaseUnits: purchaseUnits[selectionKey(supplier.id, ingredient.id)] ?? 0,
              }] : [];
            })}
            prices={supplierPrices}
            expectedOn={expectedDates[supplier.id] ?? ''}
            locale={locale}
          />
        </PurchasingForm>
      </section>
    );
  });
}
