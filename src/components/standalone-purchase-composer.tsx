'use client';

import { useId } from 'react';
import type { Ingredient, Supplier, SupplierItem } from '@/domain/master-data';
import { MAX_PURCHASE_UNITS, standalonePurchaseLines } from '@/domain/purchasing';
import { formatNumber } from '@/domain/format';
import PurchasingForm from './purchasing-form';

/** Creates a manual supplier purchase that is intentionally independent of customer demand. */
export default function StandalonePurchaseComposer({
  suppliers, packs, ingredients, locale,
}: {
  suppliers: Supplier[];
  packs: SupplierItem[];
  ingredients: Ingredient[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  const ingredientNames = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient.name]),
  );
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
          label={es ? `Crear pedido para ${supplier.name}` : `Create purchase order for ${supplier.name}`}
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
              <input id={`${prefix}-date-${supplier.id}`} name="expected_on" type="date" required />
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
                      defaultValue={ingredientPacks.find((pack) => pack.is_preferred)?.id
                        ?? ingredientPacks[0]?.id}
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
                  <input id={`${prefix}-units-${supplier.id}-${ingredient.id}`} name={`units-${ingredient.id}`} type="number" min={0} max={MAX_PURCHASE_UNITS} step="1" defaultValue={0} />
                </label>
              </fieldset>
            );
          })}
        </PurchasingForm>
      </section>
    );
  });
}
