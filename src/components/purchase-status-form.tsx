'use client';

import { useId } from 'react';
import type { PurchaseDraft } from '@/domain/purchasing';
import { facilityDate } from '@/domain/format';
import PurchasingForm from './purchasing-form';

export function CancelMaterialPlan({ id, locale, customerOrder = false }: {
  id: string; locale: 'en' | 'es'; customerOrder?: boolean;
}) {
  return (
    <PurchasingForm
      operation={customerOrder ? 'cancel-order' : 'cancel-plan'}
      locale={locale}
      label={
        locale === 'es'
          ? 'Confirmar cancelación'
          : 'Confirm cancellation'
      }
      payload={() => ({ id })}
    >
      <p>
        {locale === 'es'
          ? 'Las cantidades guardadas permanecen en el historial. Cancela primero las compras vinculadas.'
          : 'Saved quantities remain in history. Cancel linked drafts first; confirmed inbound remains on record.'}
      </p>
    </PurchasingForm>
  );
}

export default function PurchaseStatusForm({
  draft,
  locale,
}: {
  draft: PurchaseDraft;
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  if (draft.status === 'Cancelled') return null;
  return (
    <PurchasingForm
      operation="change-status"
      locale={locale}
      label={es ? 'Guardar estado' : 'Save purchase status'}
      payload={(form) => {
        const submittedCost = form.get('total_cost');
        return {
          id: draft.id,
          revision: draft.revision,
          status: form.get('status'),
          reference: form.get('reference'),
          note: form.get('note'),
          total_cost: typeof submittedCost === 'string' && submittedCost.trim()
            ? Number(submittedCost) : null,
          placed_on: form.get('status') === 'Confirmed'
            ? form.get('placed_on') : draft.placed_on,
        };
      }}
    >
      <p>
        {es
          ? 'Confirma solo una compra ya realizada con el proveedor. Esta acción no envía pedidos.'
          : 'Confirm only an order already placed with the supplier. This action does not send an order.'}
      </p>
      <div className="form-grid">
        <label htmlFor={`${prefix}-status`}>
          {es ? 'Nuevo estado' : 'New status'}
          <select id={`${prefix}-status`} name="status" required>
            {draft.status === 'Draft' && (
              <option value="Confirmed">
                {es ? 'Confirmado con proveedor' : 'Confirmed with supplier'}
              </option>
            )}
            <option value="Cancelled">{es ? 'Cancelado' : 'Cancelled'}</option>
          </select>
        </label>
        <label htmlFor={`${prefix}-reference`}>
          {es ? 'Referencia del pedido externo' : 'External order reference'}
          <input
            id={`${prefix}-reference`}
            name="reference"
            maxLength={120}
            defaultValue={draft.reference}
          />
        </label>
        <label htmlFor={`${prefix}-note`}>
          {es ? 'Nota / motivo de cancelación' : 'Note / cancellation reason'}
          <input
            id={`${prefix}-note`}
            name="note"
            maxLength={1000}
            defaultValue={draft.note}
          />
        </label>
        <label htmlFor={`${prefix}-total-cost`}>
          {es ? 'Costo total cotizado (USD)' : 'Supplier quoted total cost (USD)'}
          <input
            id={`${prefix}-total-cost`}
            name="total_cost"
            type="number"
            min="0"
            max="1000000000"
            step="0.01"
            defaultValue={draft.total_cost ?? ''}
          />
          <small>{es ? 'Obligatorio para confirmar; se conserva al cancelar.' : 'Required to confirm; retained if cancelled.'}</small>
        </label>
        <label htmlFor={`${prefix}-placed-on`}>
          {es ? 'Fecha de pedido' : 'Date placed with supplier'}
          <input
            id={`${prefix}-placed-on`}
            name="placed_on"
            type="date"
            defaultValue={draft.placed_on ?? facilityDate()}
          />
        </label>
      </div>
    </PurchasingForm>
  );
}
