'use client';

import Link from 'next/link';
import { useId, useState } from 'react';
import { formatPrice, type CustomerOption } from '@/domain/customer-pricing';
import { MAX_BATCH_COUNT } from '@/domain/purchasing';
import { formatNumber } from '@/domain/format';

export default function ProductOrderLine({
  choice,
  options,
  locale,
}: {
  choice: { id: string; name: string };
  options: CustomerOption[];
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const es = locale === 'es';
  const preferred = options.find((item) => item.is_preferred) ?? options[0];
  const [optionId, setOptionId] = useState(preferred?.id ?? '');
  const [batches, setBatches] = useState('0');
  const option = options.find((item) => item.id === optionId);
  const units = option ? (Number(batches) * 40) / option.gallons_per_unit : 0;
  const wholePackageLabel = es
    ? 'Ajusta los lotes o el empaque para obtener unidades completas.'
    : 'Adjust batches or package size to produce whole packages.';
  const validUnits = Number.isSafeInteger(Math.round(units))
    && Math.abs(units - Math.round(units)) < 0.000001;
  return (
    <div className="order-product-line">
      <label htmlFor={`${prefix}-batches`}>
        {choice.name}
        <input
          id={`${prefix}-batches`}
          name={choice.id}
          type="number"
          min={0}
          max={MAX_BATCH_COUNT}
          step="1"
          value={batches}
          onChange={(event) => setBatches(event.currentTarget.value)}
          required
        />
      </label>
      <label htmlFor={`${prefix}-unit`}>
        {es ? 'Unidad de pedido' : 'Ordering unit'}
        <select
          id={`${prefix}-unit`}
          value={option?.unit_name ?? ''}
          onChange={(event) => {
            const next = options.find((item) => item.unit_name === event.currentTarget.value);
            setOptionId(next?.id ?? '');
          }}
          disabled={!options.length}
        >
          {!options.length && (
            <option value="">
              {es ? 'Configura una unidad para este cliente' : 'Set up a customer ordering unit'}
            </option>
          )}
          {options.map((item) => (
            <option key={item.id} value={item.unit_name}>{item.unit_name}</option>
          ))}
        </select>
      </label>
      <label htmlFor={`${prefix}-packaging`}>
        {es ? 'Empaque y precio' : 'Packaging & price'}
        <input type="hidden" name={`${choice.id}-packaging`} value={optionId} />
        <select
          id={`${prefix}-packaging`}
          value={optionId}
          disabled
        >
          {!options.length && (
            <option value="">
              {es
                ? 'Configura el precio para este cliente'
                : 'Set up this customer’s package price'}
            </option>
          )}
          {option && (
            <option
              value={option.id}
            >
              {`${option.label} · ${formatPrice(option.unit_price)} / ${option.unit_name}`}
            </option>
          )}
        </select>
      </label>
      {option ? (
        <p className="notice">
          {`${formatNumber(option.gallons_per_unit)} gal / ${option.unit_name} · ${formatPrice((40 / option.gallons_per_unit) * option.unit_price)} / ${es ? 'lote de 40 gal' : '40-gallon batch'}`}
          {Number(batches) > 0 && (
            <>
              <br />
              {validUnits
                ? `${formatNumber(Number(batches))} ${es ? 'lotes' : 'batches'} × 40 gal = ${formatNumber(Math.round(units))} ${option.unit_name} · ${formatPrice(Math.round(units) * option.unit_price)}`
                : wholePackageLabel}
            </>
          )}
        </p>
      ) : (
        <p>
          <Link href="/app/products">
            {es ? 'Configurar precio en Productos →' : 'Set customer pricing in Products →'}
          </Link>
        </p>
      )}
    </div>
  );
}
