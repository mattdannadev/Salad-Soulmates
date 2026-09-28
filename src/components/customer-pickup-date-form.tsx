'use client';

import { useId } from 'react';
import PurchasingForm from './purchasing-form';

/** Changes a saved pickup commitment without changing the order's product snapshot. */
export default function CustomerPickupDateForm({
  orderId, pickupDate, locale,
}: {
  orderId: string;
  pickupDate: string;
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';

  return (
    <details className="pickup-date-change">
      <summary>{es ? 'Cambiar fecha de recogida' : 'Change pickup date'}</summary>
      <p className="muted">
        {es
          ? 'Se guarda la fecha anterior, la nueva fecha, el motivo y quién hizo el cambio. Revisa las compras y la producción después de guardar.'
          : 'The prior date, new date, reason, and person making the change are recorded. Review purchasing and production after saving.'}
      </p>
      <PurchasingForm
        operation="change-pickup-date"
        locale={locale}
        label={es ? 'Guardar fecha de recogida' : 'Save pickup date'}
        payload={(form) => ({
          id: orderId,
          needed_on: form.get('needed_on'),
          reason: form.get('reason'),
        })}
      >
        <div className="form-grid">
          <label htmlFor={`${prefix}-pickup-date`}>
            {es ? 'Nueva fecha de recogida del cliente' : 'New customer pickup date'}
            <input id={`${prefix}-pickup-date`} type="date" name="needed_on" required defaultValue={pickupDate} />
          </label>
          <label htmlFor={`${prefix}-reason`}>
            {es ? 'Motivo del cambio' : 'Reason for change'}
            <textarea id={`${prefix}-reason`} name="reason" required minLength={3} maxLength={1000} />
          </label>
        </div>
      </PurchasingForm>
    </details>
  );
}
