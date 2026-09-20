'use client';

import { useId, useState } from 'react';
import Link from 'next/link';
import { type Customer, type CustomerOption } from '@/domain/customer-pricing';
import ProductOrderLine from './product-order-line';
import PurchasingForm from './purchasing-form';

export default function CustomerOrderForm({
  choices,
  customers,
  options,
  locale,
  initialCustomerId = '',
}: {
  choices: { id: string; name: string }[];
  customers: Customer[];
  options: CustomerOption[];
  locale: 'en' | 'es';
  initialCustomerId?: string;
}) {
  const prefix = useId();
  const es = locale === 'es';
  const [customerId, setCustomerId] = useState(initialCustomerId);
  const customer = customers.find((item) => item.id === customerId);
  if (!choices.length) {
    return (
      <p className="notice">
        {es
          ? 'Configura un producto con una receta activa publicada de 40 galones para registrar pedidos.'
          : 'Configure a product with an active released 40-gallon recipe before entering an order.'}
      </p>
    );
  }
  return (
    <PurchasingForm
      operation="save-order"
      locale={locale}
      label={es ? 'Guardar pedido y calcular ingredientes' : 'Save order & estimate ingredients'}
      destination={(id) => `/app/orders?order=${id}`}
      payload={(form, requestId) => ({
        id: requestId,
        customer_name: customer?.name ?? '',
        reference: form.get('reference'),
        needed_on: form.get('needed_on'),
        products: choices
          .map((choice) => ({
            product_id: choice.id,
            customer_product_option_id: form.get(`${choice.id}-packaging`) || null,
            batch_count: Number(form.get(choice.id)),
          }))
          .filter((product) => product.batch_count !== 0),
      })}
    >
      <div className="form-grid">
        <label htmlFor={`${prefix}-customer`}>
          {es ? 'Cliente' : 'Customer'}
          <select
            id={`${prefix}-customer`}
            required
            value={customerId}
            onChange={(event) => setCustomerId(event.currentTarget.value)}
          >
            <option value="">{es ? 'Selecciona un cliente' : 'Select a customer'}</option>
            {customers
              .toSorted((a, b) => a.name.localeCompare(b.name))
              .map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
          </select>
        </label>
        <div className="customer-lookup-actions">
          <Link className="button secondary" href="/app/customers/new">
            {es ? '+ Agregar cliente' : '+ Add customer'}
          </Link>
          <Link href="/app/customers">{es ? 'Ver clientes →' : 'View customers →'}</Link>
        </div>
        <label htmlFor={`${prefix}-reference`}>
          {es ? 'Referencia del pedido (opcional)' : 'Customer order reference (optional)'}
          <input id={`${prefix}-reference`} name="reference" maxLength={120} />
        </label>
        <label htmlFor={`${prefix}-date`}>
          {es ? 'Fecha de recogida del cliente' : 'Customer pickup date'}
          <input id={`${prefix}-date`} type="date" name="needed_on" required />
        </label>
      </div>
      {customer && (
        <section
          className="notice"
          aria-label={es ? 'Datos del cliente seleccionado' : 'Selected customer details'}
        >
          <strong>{customer.name}</strong>
          <p>
            {[customer.contact_name, customer.email, customer.phone].filter(Boolean).join(' · ')
              || (es ? 'Sin contacto registrado.' : 'No contact details recorded.')}
          </p>
          {customer.address && <p>{customer.address}</p>}
          {customer.notes && <p>{customer.notes}</p>}
          <Link href={`/app/customers?customer=${customer.id}`}>
            {es ? 'Ver cliente y pedidos abiertos →' : 'View customer & open orders →'}
          </Link>
        </section>
      )}
      <h3>{es ? 'Productos y lotes' : 'Products & batches'}</h3>
      <p>
        {es
          ? 'Ingresa lotes completos de 40 galones por producto. Cero excluye un producto.'
          : 'Enter whole 40-gallon batches for each product. Leave zero to exclude a product.'}
      </p>
      {!customer ? (
        <p className="empty">
          {es
            ? 'Selecciona un cliente para ver sus precios.'
            : 'Select a customer to load their package prices.'}
        </p>
      ) : (
        <div className="form-grid" key={customer.id}>
          {choices.map((choice) => (
            <ProductOrderLine
              key={choice.id}
              choice={choice}
              locale={locale}
              options={options.filter(
                (option) => option.active
                  && option.product_id === choice.id
                  && option.customer_id === customer.id,
              )}
            />
          ))}
        </div>
      )}
    </PurchasingForm>
  );
}
