'use client';

import { useId } from 'react';
import type { PurchaseDraft } from '@/domain/purchasing';
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
      payload={(form) => ({
        id: draft.id,
        revision: draft.revision,
        status: form.get('status'),
        reference: form.get('reference'),
        note: form.get('note'),
      })}
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
      </div>
    </PurchasingForm>
  );
}
