'use client';

import { useId } from 'react';
import type { Customer } from '@/domain/customer-pricing';
import PurchasingForm from './purchasing-form';

export default function CustomerForm({
  customer = undefined,
  locale,
}: {
  customer?: Customer;
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
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
      label={es ? 'Guardar cliente' : 'Save customer'}
      destination={(id) => `/app/customers?customer=${id}`}
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
