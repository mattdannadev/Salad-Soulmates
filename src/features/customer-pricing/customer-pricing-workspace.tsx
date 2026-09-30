'use client';

import {
  useDeferredValue, useMemo, useState,
} from 'react';
import { useRouter } from 'next/navigation';
import type { Customer, CustomerOption } from '@/domain/customer-pricing';
import { formatPrice } from '@/domain/customer-pricing';
import CustomerPriceEditor from './customer-price-editor';
import {
  countConfiguredProducts,
  selectCustomerPricingProducts,
  type CustomerPricingProduct,
  type PricingAvailabilityFilter,
  type PricingConfigurationFilter,
} from './customer-pricing-view';
import styles from './customer-pricing-workspace.module.css';

interface EditorSelection { productId: string; optionId?: string }
interface Feedback { kind: 'success' | 'error'; message: string }

function parseConfigurationFilter(value: string): PricingConfigurationFilter {
  if (value === 'configured' || value === 'unconfigured') return value;
  return 'all';
}

function parseAvailabilityFilter(value: string): PricingAvailabilityFilter {
  if (value === 'active' || value === 'inactive') return value;
  return 'all';
}

export default function CustomerPricingWorkspace({
  products,
  customers,
  options,
  orderUnits,
  canWrite,
  locale,
}: {
  products: CustomerPricingProduct[];
  customers: Customer[];
  options: CustomerOption[];
  orderUnits: { code: string; label: string }[];
  canWrite: boolean;
  locale: 'en' | 'es';
}) {
  const router = useRouter();
  const [customerId, setCustomerId] = useState(customers[0]?.id ?? '');
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [configuration, setConfiguration] = useState<PricingConfigurationFilter>('all');
  const [availability, setAvailability] = useState<PricingAvailabilityFilter>('all');
  const [editor, setEditor] = useState<EditorSelection>();
  const [feedback, setFeedback] = useState<Feedback>();
  const es = locale === 'es';
  const selectedCustomer = customers.find((customer) => customer.id === customerId)
    ?? customers[0];
  const visibleProducts = useMemo(() => selectCustomerPricingProducts(
    products,
    options,
    selectedCustomer?.id ?? '',
    { query: deferredQuery, configuration, availability },
  ), [availability, configuration, deferredQuery, options, products, selectedCustomer?.id]);
  const configuredCount = selectedCustomer
    ? countConfiguredProducts(options, selectedCustomer.id) : 0;
  const clearFilters = () => {
    setQuery('');
    setConfiguration('all');
    setAvailability('all');
  };

  if (!customers.length) {
    return (
      <section className={styles.empty}>
        <h2>{es ? 'Agrega un cliente primero' : 'Add a customer first'}</h2>
        <p>
          {es
            ? 'Los precios de productos pertenecen a un cliente. Crea uno antes de configurar precios.'
            : 'Product pricing belongs to a customer. Create one before configuring prices.'}
        </p>
        <a className="button" href="/app/customers">
          {es ? 'Ir a clientes' : 'Go to customers'}
        </a>
      </section>
    );
  }

  return (
    <section className={styles.workspace} aria-label={es ? 'Precios por cliente' : 'Customer pricing'}>
      <div className={styles.summary}>
        <div>
          <span className={styles.eyebrow}>{es ? 'Lista de precios del cliente' : 'Customer price book'}</span>
          <label className={styles.customerPicker} htmlFor="customer-pricing-customer">
            <span>{es ? 'Cliente' : 'Customer'}</span>
            <select
              id="customer-pricing-customer"
              value={selectedCustomer?.id ?? ''}
              onChange={(event) => {
                setCustomerId(event.currentTarget.value);
                setEditor(undefined);
                setFeedback(undefined);
              }}
            >
              {customers.map((customer) => (
                <option key={customer.id} value={customer.id}>{customer.name}</option>
              ))}
            </select>
          </label>
        </div>
        <div className={styles.metrics} aria-label={es ? 'Resumen de precios' : 'Pricing summary'}>
          <span>
            <strong>{configuredCount}</strong>
            {es ? ' configurados' : ' configured'}
          </span>
          <span>
            <strong>{Math.max(0, products.length - configuredCount)}</strong>
            {es ? ' por configurar' : ' to configure'}
          </span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.search} htmlFor="customer-pricing-search">
          <span>{es ? 'Buscar productos o precios' : 'Search products or price options'}</span>
          <input
            id="customer-pricing-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={es ? 'Nombre, código, unidad…' : 'Name, code, unit…'}
          />
        </label>
        <label htmlFor="customer-pricing-configuration">
          <span>{es ? 'Configuración' : 'Configuration'}</span>
          <select
            id="customer-pricing-configuration"
            value={configuration}
            onChange={(event) => setConfiguration(
              parseConfigurationFilter(event.currentTarget.value),
            )}
          >
            <option value="all">{es ? 'Todos' : 'All products'}</option>
            <option value="configured">{es ? 'Configurados' : 'Configured'}</option>
            <option value="unconfigured">{es ? 'Sin configurar' : 'Not configured'}</option>
          </select>
        </label>
        <label htmlFor="customer-pricing-availability">
          <span>{es ? 'Disponibilidad' : 'Availability'}</span>
          <select
            id="customer-pricing-availability"
            value={availability}
            onChange={(event) => setAvailability(
              parseAvailabilityFilter(event.currentTarget.value),
            )}
          >
            <option value="all">{es ? 'Todas' : 'All states'}</option>
            <option value="active">{es ? 'Activas' : 'Active'}</option>
            <option value="inactive">{es ? 'Inactivas' : 'Inactive'}</option>
          </select>
        </label>
        <button type="button" className="button secondary" onClick={clearFilters}>
          {es ? 'Borrar filtros' : 'Clear filters'}
        </button>
      </div>

      <div className={styles.resultHeading} aria-live="polite">
        <p>
          <strong>{visibleProducts.length.toLocaleString()}</strong>
          {es ? ' productos' : ' products'}
          {selectedCustomer ? ` · ${selectedCustomer.name}` : ''}
        </p>
        <span>{es ? 'Los precios se muestran por unidad de venta.' : 'Prices are shown per sales unit.'}</span>
      </div>

      {feedback ? (
        <p
          role={feedback.kind === 'success' ? 'status' : 'alert'}
          className={feedback.kind === 'success' ? 'notice' : 'error-notice'}
        >
          {feedback.message}
        </p>
      ) : null}

      {!visibleProducts.length ? (
        <div className={styles.empty}>
          <h2>{es ? 'No hay productos en esta vista' : 'No products match this view'}</h2>
          <p>{es ? 'Ajusta la búsqueda o borra los filtros.' : 'Try another search or clear the filters.'}</p>
          <button type="button" className="button secondary" onClick={clearFilters}>
            {es ? 'Borrar filtros' : 'Clear filters'}
          </button>
        </div>
      ) : (
        <div className={styles.catalog}>
          {visibleProducts.map(({ product, options: productOptions }) => {
            const isEditingProduct = editor?.productId === product.id;
            const selectedOption = productOptions.find((option) => option.id === editor?.optionId);
            let productActiveLabel = es ? 'Inactivo' : 'Inactive';
            if (product.active) productActiveLabel = es ? 'Activo' : 'Active';
            return (
              <article key={product.id} className={styles.productCard}>
                <div className={styles.productHeading}>
                  <div>
                    <div className={styles.productTitle}>
                      <h2>{product.name}</h2>
                      <span className={product.active ? styles.activeBadge : styles.inactiveBadge}>
                        {productActiveLabel}
                      </span>
                    </div>
                    <p>
                      {product.product_code ? `${product.product_code} · ` : ''}
                      {`${(product.bag_size_gallons * product.bags_per_case).toLocaleString()} ${es ? 'gal/caja predeterminada' : 'gal/default case'}`}
                    </p>
                  </div>
                  {canWrite ? (
                    <button
                      type="button"
                      className="button secondary button--compact"
                      onClick={() => {
                        setEditor({ productId: product.id });
                        setFeedback(undefined);
                      }}
                      disabled={isEditingProduct}
                    >
                      {es ? 'Agregar precio' : 'Add price'}
                    </button>
                  ) : null}
                </div>

                {!productOptions.length ? (
                  <div className={styles.unconfigured}>
                    <span>{es ? 'Sin configurar' : 'Not configured'}</span>
                    <p>
                      {es
                        ? 'Este producto todavía no tiene precio para el cliente seleccionado.'
                        : 'This product does not have a price for the selected customer yet.'}
                    </p>
                  </div>
                ) : (
                  <div className={styles.options}>
                    {productOptions.map((option) => {
                      let optionActiveLabel = es ? 'Inactiva' : 'Inactive';
                      if (option.active) optionActiveLabel = es ? 'Activa' : 'Active';
                      return (
                        <div key={`${option.id}-${option.revision}`} className={styles.optionRow}>
                          <div>
                            <strong>{option.label}</strong>
                            <span>
                              {`${option.gallons_per_unit.toLocaleString()} ${es ? 'gal' : 'gal'} / ${option.unit_name}`}
                              {option.is_preferred ? ` · ${es ? 'Preferida' : 'Preferred'}` : ''}
                            </span>
                          </div>
                          <div className={styles.price}>
                            <strong>{formatPrice(option.unit_price)}</strong>
                            <span>{`/ ${option.unit_name}`}</span>
                          </div>
                          <span
                            className={option.active ? styles.activeBadge : styles.inactiveBadge}
                          >
                            {optionActiveLabel}
                          </span>
                          {canWrite ? (
                            <button
                              type="button"
                              className="button tertiary button--compact"
                              onClick={() => {
                                setEditor({ productId: product.id, optionId: option.id });
                                setFeedback(undefined);
                              }}
                              disabled={isEditingProduct}
                            >
                              {es ? 'Editar' : 'Edit'}
                            </button>
                          ) : null}
                        </div>
                      );
                    })}
                  </div>
                )}

                {isEditingProduct && selectedCustomer ? (
                  <CustomerPriceEditor
                    key={`${product.id}-${selectedOption?.id ?? 'new'}-${selectedOption?.revision ?? 0}`}
                    customer={selectedCustomer}
                    product={product}
                    option={selectedOption}
                    orderUnits={orderUnits}
                    locale={locale}
                    onCancel={() => setEditor(undefined)}
                    onSaved={(nextFeedback) => {
                      setFeedback(nextFeedback);
                      setEditor(undefined);
                      router.refresh();
                    }}
                  />
                ) : null}
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}
