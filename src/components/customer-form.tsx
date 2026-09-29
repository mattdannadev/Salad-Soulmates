'use client';

import { useId, useSyncExternalStore } from 'react';
import type { Customer } from '@/domain/customer-pricing';
import type { ReturnContext } from '@/lib/return-context';
import { customerReturnContext, customerReturnHref } from '@/app/app/customers/return-context';
import PurchasingForm from './purchasing-form';

function subscribeToFragment(callback: () => void) {
  window.addEventListener('hashchange', callback);
  return () => window.removeEventListener('hashchange', callback);
}

export default function CustomerForm({
  customer = undefined,
  locale,
  returnContext,
}: {
  customer?: Customer;
  locale: 'en' | 'es';
  returnContext: ReturnContext;
}) {
  const prefix = useId();
  const es = locale === 'es';
  const fragment = useSyncExternalStore(
    subscribeToFragment,
    () => window.location.hash,
    () => '',
  );
  let returnHref = returnContext.href;
  if (customer && fragment) {
    const url = new URL(returnContext.href, window.location.origin);
    url.hash = fragment;
    returnHref = `${url.pathname}${url.search}${url.hash}`;
  }
  const origin = customerReturnContext(returnHref, returnContext.focusRow);
  let submitLabel = es ? 'Crear cliente' : 'Create customer';
  if (customer) submitLabel = es ? 'Guardar cambios' : 'Save changes';
  const fields = [
    { name: 'name', label: es ? 'Cliente' : 'Customer name', max: 120 },
    { name: 'contact_name', label: es ? 'Contacto' : 'Contact name', max: 120 },
    { name: 'email', label: es ? 'Correo' : 'Email', max: 254 },
    { name: 'phone', label: es ? 'Teléfono' : 'Phone', max: 40 },
    { name: 'address', label: es ? 'Dirección' : 'Address', max: 1000 },
    { name: 'notes', label: es ? 'Notas del cliente' : 'Customer notes', max: 2000 },
  ] as const;
  return (
    <PurchasingForm
      operation="save-customer"
      locale={locale}
      label={submitLabel}
      destination={(id) => customerReturnHref(origin, id)}
      cancelHref={customerReturnHref(origin)}
      replaceOnSuccess
      payload={(form, id) => ({
        id: customer?.id ?? id,
        revision: customer?.revision ?? 0,
        ...Object.fromEntries(fields.map((field) => [field.name, form.get(field.name)])),
      })}
    >
      <div className="form-grid">
        {fields.map((field) => (
          <label key={field.name} htmlFor={`${prefix}-${field.name}`}>
            {field.label}
            <input
              id={`${prefix}-${field.name}`}
              name={field.name}
              maxLength={field.max}
              type={field.name === 'email' ? 'email' : 'text'}
              required={field.name === 'name'}
              readOnly={field.name === 'name' && Boolean(customer)}
              defaultValue={customer?.[field.name] ?? ''}
            />
          </label>
        ))}
      </div>
    </PurchasingForm>
  );
}
