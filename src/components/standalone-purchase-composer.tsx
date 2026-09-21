'use client';

import { useId } from 'react';
import type { Ingredient, Supplier, SupplierItem } from '@/domain/master-data';
import { MAX_PURCHASE_UNITS } from '@/domain/purchasing';
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
          label={es ? `Crear borrador para ${supplier.name}` : `Create draft for ${supplier.name}`}
          payload={(form, requestId) => {
            const submittedReason = form.get('reason');
            const reason = typeof submittedReason === 'string' ? submittedReason : '';
            return {
              id: requestId,
              kind: 'standalone' as const,
              supplier_id: supplier.id,
              expected_on: form.get('expected_on'),
              lines: supplierPacks.flatMap((pack) => {
                const units = Number(form.get(`units-${pack.id}`));
                return Number.isInteger(units) && units > 0 ? [{
                  ingredient_id: pack.ingredient_id,
                  supplier_item_id: pack.id,
                  purchase_units: units,
                  override_reason: reason,
                }] : [];
              }),
            };
          }}
        >
          <div className="form-grid">
            <label htmlFor={`${prefix}-date-${supplier.id}`}>
              {es ? 'Fecha prevista' : 'Expected delivery'}
              <input id={`${prefix}-date-${supplier.id}`} name="expected_on" type="date" required />
            </label>
            <label htmlFor={`${prefix}-reason-${supplier.id}`}>
              {es ? 'Motivo de compra' : 'Purchase reason'}
              <input id={`${prefix}-reason-${supplier.id}`} name="reason" minLength={3} maxLength={1000} required />
            </label>
          </div>
          {supplierPacks.map((pack) => (
            <label key={pack.id} htmlFor={`${prefix}-units-${pack.id}`}>
              {`${ingredientNames.get(pack.ingredient_id)} · ${formatNumber(pack.pack_quantity)} ${pack.pack_quantity_uom}/${pack.purchase_uom}`}
              <input id={`${prefix}-units-${pack.id}`} name={`units-${pack.id}`} type="number" min={0} max={MAX_PURCHASE_UNITS} step="1" defaultValue={0} />
            </label>
          ))}
        </PurchasingForm>
      </section>
    );
  });
}
