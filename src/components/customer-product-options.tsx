import type { Customer, CustomerOption } from '@/domain/customer-pricing';
import { formatPrice } from '@/domain/customer-pricing';
import { formatNumber } from '@/domain/format';
import CustomerOptionForm from './customer-option-form';

export default function CustomerProductOptions({
  productId,
  productName,
  defaultGallons,
  customers,
  options,
  canWrite,
  locale,
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
      <summary>{es ? 'Precios y empaques por cliente' : 'Customer pricing & packaging'}</summary>
      <div className="customer-options-content">
        <header>
          <p className="detail-label">
            {es ? 'CONFIGURACIÓN COMERCIAL' : 'CUSTOMER-SPECIFIC CONFIGURATION'}
          </p>
          <h3>{productName}</h3>
        </header>
        <p className="customer-options-intro">
          {es
            ? 'El empaque predeterminado se muestra arriba. Las opciones aquí pertenecen a clientes específicos y no cambian el producto.'
            : 'The default packaging is above. Options here belong to individual customers and do not change the product.'}
        </p>
        {!options.length && (
          <p>{es ? 'Aún no hay opciones de clientes.' : 'No customer options yet.'}</p>
        )}
        {options.map((option) => (
          <details className="customer-option" key={`${option.id}-${option.revision}`}>
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
          <details className="customer-option customer-option-new" key={`new-${options.length}`}>
            <summary>{es ? '+ Agregar opción de cliente' : '+ Add customer option'}</summary>
            <CustomerOptionForm
              productId={productId}
              defaultGallons={defaultGallons}
              customers={customers}
              locale={locale}
            />
          </details>
        )}
      </div>
    </details>
  );
}
