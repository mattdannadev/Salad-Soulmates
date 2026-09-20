'use client';

import { useId, useState } from 'react';
import type { Customer, CustomerOption } from '@/domain/customer-pricing';
import PurchasingForm from './purchasing-form';

export default function CustomerOptionForm({
  productId, defaultGallons, customers, locale, option = undefined,
}: {
  productId: string;
  defaultGallons: number;
  customers: Customer[];
  locale: 'en' | 'es';
  option?: CustomerOption;
}) {
  const prefix = useId();
  const es = locale === 'es';
  const [mode, setMode] = useState<string>(option?.packaging_mode ?? 'product_default');
  return (
    <PurchasingForm
      operation="save-option"
      locale={locale}
      label={es ? 'Guardar opción del cliente' : 'Save customer option'}
      payload={(form, requestId) => ({
        id: option?.id ?? requestId,
        revision: option?.revision ?? 0,
        product_id: productId,
        customer_name: form.get('customer_name'),
        label: form.get('label'),
        packaging_mode: form.get('packaging_mode'),
        unit_name: mode === 'product_default' ? 'case' : form.get('unit_name'),
        gallons_per_unit: mode === 'product_default' ? defaultGallons : Number(form.get('gallons_per_unit')),
        unit_price: Number(form.get('unit_price')),
        currency: 'USD',
        active: form.get('active') === 'true',
      })}
    >
      <div className="form-grid">
        <label htmlFor={`${prefix}-customer`}>
          {es ? 'Cliente' : 'Customer'}
          <input id={`${prefix}-customer`} list={`${prefix}-customers`} name="customer_name" required maxLength={120} readOnly={Boolean(option)} defaultValue={customers.find((customer) => customer.id === option?.customer_id)?.name ?? ''} />
          <datalist id={`${prefix}-customers`}>{customers.map((customer) => <option key={customer.id} value={customer.name}>{customer.name}</option>)}</datalist>
        </label>
        <label htmlFor={`${prefix}-label`}>
          {es ? 'Nombre de la opción' : 'Option name'}
          <input id={`${prefix}-label`} name="label" required maxLength={120} defaultValue={option?.label ?? ''} placeholder={es ? 'Bolsa de 2 galones' : '2-gallon bag'} />
        </label>
        <label htmlFor={`${prefix}-mode`}>
          {es ? 'Empaque' : 'Packaging'}
          <select id={`${prefix}-mode`} name="packaging_mode" value={mode} onChange={(event) => setMode(event.currentTarget.value)}>
            <option value="product_default">{es ? 'Copiar empaque predeterminado (caja)' : 'Copy default packaging (case)'}</option>
            <option value="custom">{es ? 'Empaque específico del cliente' : 'Customer-specific packaging'}</option>
          </select>
        </label>
        {mode === 'custom' && (
        <>
          <label htmlFor={`${prefix}-unit`}>
            {es ? 'Unidad de venta' : 'Sales unit'}
            <input id={`${prefix}-unit`} name="unit_name" required maxLength={80} defaultValue={option?.unit_name ?? ''} placeholder={es ? 'bolsa, caja, botella' : 'bag, case, bottle'} />
          </label>
          <label htmlFor={`${prefix}-gallons`}>
            {es ? 'Galones por unidad de venta' : 'Gallons per sales unit'}
            <input id={`${prefix}-gallons`} name="gallons_per_unit" type="number" min="0.0001" max="1000000" step="0.0001" required defaultValue={option?.gallons_per_unit ?? defaultGallons} />
          </label>
        </>
        )}
        <label htmlFor={`${prefix}-price`}>
          {es ? 'Precio por unidad (USD)' : 'Price per unit (USD)'}
          <input id={`${prefix}-price`} name="unit_price" type="number" min="0" max="1000000" step="0.01" required defaultValue={option?.unit_price ?? ''} />
        </label>
        <label htmlFor={`${prefix}-active`}>
          {es ? 'Disponibilidad' : 'Availability'}
          <select id={`${prefix}-active`} name="active" defaultValue={option?.active === false ? 'false' : 'true'}>
            <option value="true">{es ? 'Activa' : 'Active'}</option>
            <option value="false">{es ? 'Inactiva' : 'Inactive'}</option>
          </select>
        </label>
      </div>
    </PurchasingForm>
  );
}
