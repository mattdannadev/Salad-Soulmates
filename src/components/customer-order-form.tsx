'use client';

import {
  useId, useMemo, useState, useSyncExternalStore,
} from 'react';
import Link from 'next/link';
import { customerCreateHref, customerReturnContext } from '@/app/app/customers/return-context';
import { type Customer, type CustomerOption } from '@/domain/customer-pricing';
import {
  clearOrderDraft, orderDraftFromForm, orderDraftSnapshot, parseOrderDraftSnapshot,
  orderProductSetupHref, saveOrderDraft,
} from '@/app/app/orders/order-draft';
import ProductOrderLine from './product-order-line';
import PurchasingForm from './purchasing-form';

function subscribeToDraft(callback: () => void) {
  window.addEventListener('storage', callback);
  return () => window.removeEventListener('storage', callback);
}

export default function CustomerOrderForm({
  choices,
  customers,
  options,
  locale,
  initialCustomerId = '',
  draftId,
  returnHref,
}: {
  choices: { id: string; name: string }[];
  customers: Customer[];
  options: CustomerOption[];
  locale: 'en' | 'es';
  initialCustomerId?: string;
  draftId: string;
  returnHref: string;
}) {
  const prefix = useId();
  const es = locale === 'es';
  const serializedDraft = useSyncExternalStore(
    subscribeToDraft,
    () => orderDraftSnapshot(draftId),
    () => '',
  );
  const draft = useMemo(() => parseOrderDraftSnapshot(serializedDraft), [serializedDraft]);
  const [selectedCustomerId, setCustomerId] = useState<string | null>(null);
  const [draftError, setDraftError] = useState('');
  const restoredCustomer = draft?.customerId && customers.some(
    (item) => item.id === draft.customerId,
  ) ? draft.customerId : '';
  const customerId = selectedCustomerId ?? (initialCustomerId || restoredCustomer);
  const customer = customers.find((item) => item.id === customerId);
  const createCustomerHref = customerCreateHref(customerReturnContext(returnHref, undefined));
  const configureProductsHref = orderProductSetupHref(returnHref);
  const missingCustomerPricing = customer && choices.every((choice) => !options.some(
    (option) => option.active && option.customer_id === customer.id
      && option.product_id === choice.id,
  ));
  const saveBeforeDetour = (event: React.MouseEvent<HTMLAnchorElement>) => {
    const form = event.currentTarget.closest('form');
    const emptyDraft = {
      customerId,
      reference: '',
      neededOn: '',
      products: [],
    };
    const existingDraft = draft ? { ...draft, customerId } : emptyDraft;
    const snapshot = form
      ? orderDraftFromForm(new FormData(form), customerId, choices)
      : existingDraft;
    if (!snapshot || !saveOrderDraft(draftId, snapshot)) {
      event.preventDefault();
      setDraftError(es
        ? 'Revisa los datos del pedido o habilita el almacenamiento de esta pestaña antes de continuar.'
        : 'Check the order entries or enable tab storage before continuing.');
    }
  };
  if (!choices.length) {
    return (
      <div className="notice">
        <p>
          {es
            ? 'Configura un producto con una receta activa publicada de 40 galones para registrar pedidos.'
            : 'Configure a product with an active released 40-gallon recipe before entering an order.'}
        </p>
        <Link className="button secondary" href={configureProductsHref} onClick={saveBeforeDetour}>
          {es ? 'Configurar productos →' : 'Configure products →'}
        </Link>
        {draftError && <p role="alert" className="error-notice">{draftError}</p>}
      </div>
    );
  }
  return (
    <PurchasingForm
      operation="save-order"
      locale={locale}
      label={es ? 'Guardar pedido y calcular ingredientes' : 'Save order & estimate ingredients'}
      destination={(id) => {
        clearOrderDraft(draftId);
        return `/app/orders?order=${id}`;
      }}
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
          <Link
            className="button secondary"
            href={createCustomerHref}
            onClick={saveBeforeDetour}
          >
            {es ? '+ Agregar cliente' : '+ Add customer'}
          </Link>
          <Link href="/app/customers">{es ? 'Ver clientes →' : 'View customers →'}</Link>
        </div>
        {draftError && <p role="alert" className="error-notice">{draftError}</p>}
        <label htmlFor={`${prefix}-reference`}>
          {es ? 'Referencia del pedido (opcional)' : 'Customer order reference (optional)'}
          <input id={`${prefix}-reference`} name="reference" maxLength={120} defaultValue={draft?.reference ?? ''} key={draft ? 'restored-reference' : 'new-reference'} />
        </label>
        <label htmlFor={`${prefix}-date`}>
          {es ? 'Fecha de recogida del cliente' : 'Customer pickup date'}
          <input id={`${prefix}-date`} type="date" name="needed_on" required defaultValue={draft?.neededOn ?? ''} key={draft ? 'restored-date' : 'new-date'} />
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
      {missingCustomerPricing && (
        <div className="notice">
          <p>
            {es
              ? 'Este cliente no tiene precios activos para los productos disponibles.'
              : 'This customer has no active pricing for the available products.'}
          </p>
          <Link className="button secondary" href={configureProductsHref} onClick={saveBeforeDetour}>
            {es ? 'Configurar productos →' : 'Configure products →'}
          </Link>
        </div>
      )}
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
        <div className="form-grid" key={`${customer.id}-${draft ? 'restored' : 'new'}`}>
          {choices.map((choice) => (
            <ProductOrderLine
              key={choice.id}
              choice={choice}
              locale={locale}
              initialBatches={draft?.products.find((line) => line.id === choice.id)?.batches}
              initialOptionId={draft?.products.find((line) => line.id === choice.id)?.optionId}
              options={options.filter(
                (option) => option.active
                  && option.product_id === choice.id
                  && option.customer_id === customer.id,
              )}
              configureHref={configureProductsHref}
              onConfigureClick={saveBeforeDetour}
            />
          ))}
        </div>
      )}
    </PurchasingForm>
  );
}
