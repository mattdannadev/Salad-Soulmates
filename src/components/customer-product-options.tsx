import type { Customer, CustomerOption } from '@/domain/customer-pricing';
import { formatPrice } from '@/domain/customer-pricing';
import { formatNumber } from '@/domain/format';
import CustomerOptionForm from './customer-option-form';

export default function CustomerProductOptions({
  productId, productName, defaultGallons, customers, options, canWrite, locale,
}: {
  productId: string;
  productName: string;
  defaultGallons: number;
  customers: Customer[];
  options: CustomerOption[];
  canWrite: boolean;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const activeLabel = es ? 'Activa' : 'Active';
  const inactiveLabel = es ? 'Inactiva' : 'Inactive';
  return (
    <details className="product-customer-options">
      <summary>{`${es ? 'Precios y empaques por cliente' : 'Customer pricing & packaging'} · ${productName}`}</summary>
      <p>
        {es
          ? 'El empaque predeterminado del producto se muestra arriba. Cada cliente puede tener varias unidades y precios; los pedidos guardan la opción elegida.'
          : 'The product’s default packaging is shown above. Each customer can have multiple units and prices; orders preserve the selected option.'}
      </p>
      {!options.length && <p>{es ? 'Aún no hay opciones de clientes.' : 'No customer options yet.'}</p>}
      {options.map((option) => (
        <details key={`${option.id}-${option.revision}`}>
          <summary>{`${customers.find((customer) => customer.id === option.customer_id)?.name ?? '—'} · ${option.label} · ${formatPrice(option.unit_price)} / ${option.unit_name}`}</summary>
          <p>{`${formatNumber(option.gallons_per_unit)} gal / ${option.unit_name} · ${option.active ? activeLabel : inactiveLabel}`}</p>
          {canWrite && (
          <CustomerOptionForm
            productId={productId}
            defaultGallons={defaultGallons}
            customers={customers}
            option={option}
            locale={locale}
          />
          )}
        </details>
      ))}
      {canWrite && (
      <details key={`new-${options.length}`}>
        <summary>{es ? '+ Agregar opción de cliente' : '+ Add customer option'}</summary>
        <CustomerOptionForm
          productId={productId}
          defaultGallons={defaultGallons}
          customers={customers}
          locale={locale}
        />
      </details>
      )}
    </details>
  );
}
