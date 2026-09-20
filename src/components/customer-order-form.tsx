'use client';

import { useId, useState } from 'react';
import { formatPrice, type Customer, type CustomerOption } from '@/domain/customer-pricing';
import { MAX_BATCH_COUNT } from '@/domain/purchasing';
import PurchasingForm from './purchasing-form';

export default function CustomerOrderForm({
  choices, customers, options, locale,
}: {
  choices: { id: string; name: string }[];
  customers: Customer[];
  options: CustomerOption[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  const [customerName, setCustomerName] = useState('');
  const customer = customers.find(
    (item) => item.name.toLowerCase() === customerName.trim().toLowerCase(),
  );
  if (!choices.length) return <p className="notice">{es ? 'Configura un producto con una receta activa publicada de 40 galones para registrar pedidos.' : 'Configure a product with an active released 40-gallon recipe before entering an order.'}</p>;
  return (
    <PurchasingForm
      operation="save-order"
      locale={locale}
      label={es ? 'Guardar pedido y calcular ingredientes' : 'Save order & estimate ingredients'}
      destination={(id) => `/app/orders?order=${id}`}
      payload={(form, requestId) => ({
        id: requestId,
        customer_name: form.get('customer_name'),
        reference: form.get('reference'),
        needed_on: form.get('needed_on'),
        products: choices.map((choice) => ({
          product_id: choice.id,
          customer_product_option_id: form.get(`${choice.id}-packaging`) || null,
          batch_count: Number(form.get(choice.id)),
        })).filter((product) => product.batch_count !== 0),
      })}
    >
      <div className="form-grid">
        <label htmlFor={`${prefix}-customer`}>
          {es ? 'Cliente' : 'Customer'}
          <input id={`${prefix}-customer`} name="customer_name" list={`${prefix}-customers`} required maxLength={120} value={customerName} onChange={(event) => setCustomerName(event.currentTarget.value)} />
          <datalist id={`${prefix}-customers`}>{customers.map((item) => <option key={item.id} value={item.name}>{item.name}</option>)}</datalist>
        </label>
        <label htmlFor={`${prefix}-reference`}>
          {es ? 'Referencia del pedido (opcional)' : 'Customer order reference (optional)'}
          <input id={`${prefix}-reference`} name="reference" maxLength={120} />
        </label>
        <label htmlFor={`${prefix}-date`}>
          {es ? 'Fecha requerida por el cliente' : 'Customer needs by'}
          <input id={`${prefix}-date`} type="date" name="needed_on" required />
        </label>
      </div>
      <h3>{es ? 'Productos y lotes' : 'Products & batches'}</h3>
      <p>{es ? 'Ingresa lotes completos de 40 galones por producto. Cero excluye un producto.' : 'Enter whole 40-gallon batches for each product. Leave zero to exclude a product.'}</p>
      <div className="form-grid">
        {choices.map((choice) => (
          <div key={choice.id}>
            <label htmlFor={`${prefix}-${choice.id}`}>
              {choice.name}
              <input id={`${prefix}-${choice.id}`} name={choice.id} type="number" min={0} max={MAX_BATCH_COUNT} step="1" defaultValue="0" required />
            </label>
            <label htmlFor={`${prefix}-${choice.id}-packaging`}>
              {es ? 'Empaque y precio' : 'Packaging & price'}
              <select key={customer?.id ?? 'new'} id={`${prefix}-${choice.id}-packaging`} name={`${choice.id}-packaging`} defaultValue="">
                <option value="">{es ? 'Empaque predeterminado · precio sin configurar' : 'Default packaging · price not set'}</option>
                {options.filter((option) => option.active && option.product_id === choice.id
                  && option.customer_id === customer?.id).map((option) => (
                    <option key={option.id} value={option.id}>{`${option.label} · ${formatPrice(option.unit_price)} / ${option.unit_name}`}</option>
                ))}
              </select>
            </label>
          </div>
        ))}
      </div>
    </PurchasingForm>
  );
}
