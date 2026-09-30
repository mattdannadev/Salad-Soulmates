'use client';

import {
  useEffect, useId, useRef, useState, useTransition,
} from 'react';
import savePurchasing from '@/app/purchasing-actions';
import type { Customer, CustomerOption } from '@/domain/customer-pricing';
import type { CustomerPricingProduct } from './customer-pricing-view';
import styles from './customer-pricing-workspace.module.css';

interface Feedback { kind: 'success' | 'error'; message: string }

export default function CustomerPriceEditor({
  customer,
  product,
  option = undefined,
  orderUnits,
  locale,
  onCancel,
  onSaved,
}: {
  customer: Customer;
  product: CustomerPricingProduct;
  option?: CustomerOption;
  orderUnits: { code: string; label: string }[];
  locale: 'en' | 'es';
  onCancel: () => void;
  onSaved: (feedback: Feedback) => void;
}) {
  const prefix = useId();
  const createId = useRef<string | undefined>(undefined);
  const priceInput = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState(option?.packaging_mode ?? 'product_default');
  const [feedback, setFeedback] = useState<Feedback>();
  const [pending, startTransition] = useTransition();
  const es = locale === 'es';
  const defaultGallons = product.bag_size_gallons * product.bags_per_case;
  let revisionLabel = es ? 'Nuevo precio' : 'New price';
  if (option) revisionLabel = `${es ? 'Revisión' : 'Revision'} ${option.revision}`;
  let submitLabel = es ? 'Guardar precio' : 'Save price';
  if (pending) submitLabel = es ? 'Guardando…' : 'Saving…';

  useEffect(() => {
    priceInput.current?.focus();
  }, []);

  return (
    <form
      className={styles.editor}
      aria-label={option
        ? `${es ? 'Editar precio de' : 'Edit price for'} ${product.name}`
        : `${es ? 'Agregar precio para' : 'Add price for'} ${product.name}`}
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        createId.current ??= crypto.randomUUID();
        const input = {
          id: option?.id ?? createId.current,
          revision: option?.revision ?? 0,
          product_id: product.id,
          customer_id: customer.id,
          label: form.get('label'),
          packaging_mode: mode,
          unit_name: mode === 'product_default' ? 'case' : form.get('unit_name'),
          gallons_per_unit: mode === 'product_default'
            ? defaultGallons : Number(form.get('gallons_per_unit')),
          unit_price: Number(form.get('unit_price')),
          currency: 'USD',
          active: form.get('active') === 'true',
          is_preferred: form.get('is_preferred') === 'true',
        };
        setFeedback(undefined);
        startTransition(async () => {
          try {
            const response = await savePurchasing('save-option', input);
            if (!response.ok) {
              setFeedback({ kind: 'error', message: response.message });
              return;
            }
            onSaved({
              kind: 'success',
              message: es
                ? `Precio de ${product.name} guardado. Actualizando la lista…`
                : `${product.name} price saved. Refreshing the list…`,
            });
          } catch {
            setFeedback({
              kind: 'error',
              message: es
                ? 'Conexión interrumpida. Vuelve a intentar; tus datos siguen aquí.'
                : 'Connection interrupted. Retry; your entries are still here.',
            });
          }
        });
      }}
    >
      <div className={styles.editorHeading}>
        <div>
          <span className={styles.eyebrow}>{customer.name}</span>
          <h3>{product.name}</h3>
        </div>
        <span className={styles.revision}>
          {revisionLabel}
        </span>
      </div>
      <div className={styles.formGrid}>
        <label htmlFor={`${prefix}-label`}>
          {es ? 'Nombre de la opción' : 'Price option name'}
          <input
            id={`${prefix}-label`}
            name="label"
            required
            maxLength={120}
            defaultValue={option?.label ?? ''}
            placeholder={es ? 'Caja estándar' : 'Standard case'}
          />
        </label>
        <label htmlFor={`${prefix}-price`}>
          {es ? 'Precio por unidad (USD)' : 'Unit price (USD)'}
          <input
            id={`${prefix}-price`}
            name="unit_price"
            type="number"
            inputMode="decimal"
            min="0"
            max="1000000"
            step="0.01"
            required
            defaultValue={option?.unit_price ?? ''}
            ref={priceInput}
          />
        </label>
        <label htmlFor={`${prefix}-mode`}>
          {es ? 'Empaque' : 'Packaging'}
          <select
            id={`${prefix}-mode`}
            name="packaging_mode"
            value={mode}
            onChange={(event) => setMode(
              event.currentTarget.value === 'custom' ? 'custom' : 'product_default',
            )}
          >
            <option value="product_default">
              {es ? 'Empaque predeterminado del producto' : 'Product default packaging'}
            </option>
            <option value="custom">
              {es ? 'Empaque específico del cliente' : 'Customer-specific packaging'}
            </option>
          </select>
          {mode === 'product_default' ? (
            <small>
              {`${defaultGallons.toLocaleString()} ${es ? 'galones por caja' : 'gallons per case'}`}
            </small>
          ) : null}
        </label>
        {mode === 'custom' ? (
          <>
            <label htmlFor={`${prefix}-unit`}>
              {es ? 'Unidad de venta' : 'Sales unit'}
              <select
                id={`${prefix}-unit`}
                name="unit_name"
                required
                defaultValue={option?.unit_name ?? ''}
              >
                <option value="">{es ? 'Selecciona una unidad' : 'Select a unit'}</option>
                {orderUnits.map((unit) => (
                  <option key={unit.code} value={unit.code}>{unit.label}</option>
                ))}
              </select>
            </label>
            <label htmlFor={`${prefix}-gallons`}>
              {es ? 'Galones por unidad' : 'Gallons per unit'}
              <input
                id={`${prefix}-gallons`}
                name="gallons_per_unit"
                type="number"
                inputMode="decimal"
                min="0.0001"
                max="1000000"
                step="0.0001"
                required
                defaultValue={option?.gallons_per_unit ?? defaultGallons}
              />
            </label>
          </>
        ) : null}
        <label htmlFor={`${prefix}-active`}>
          {es ? 'Disponibilidad' : 'Availability'}
          <select
            id={`${prefix}-active`}
            name="active"
            defaultValue={option?.active === false ? 'false' : 'true'}
          >
            <option value="true">{es ? 'Activa' : 'Active'}</option>
            <option value="false">{es ? 'Inactiva' : 'Inactive'}</option>
          </select>
        </label>
        <label htmlFor={`${prefix}-preferred`}>
          {es ? 'Unidad preferida' : 'Preferred ordering unit'}
          <select
            id={`${prefix}-preferred`}
            name="is_preferred"
            defaultValue={option?.is_preferred ? 'true' : 'false'}
          >
            <option value="false">{es ? 'No' : 'No'}</option>
            <option value="true">{es ? 'Sí' : 'Yes'}</option>
          </select>
        </label>
      </div>
      {feedback ? (
        <p role="alert" className="error-notice">{feedback.message}</p>
      ) : null}
      <div className={styles.editorActions}>
        <button type="button" className="button secondary" onClick={onCancel} disabled={pending}>
          {es ? 'Cancelar' : 'Cancel'}
        </button>
        <button type="submit" disabled={pending} aria-busy={pending}>
          {submitLabel}
        </button>
      </div>
    </form>
  );
}
