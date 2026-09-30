import CustomerPricingWorkspace from '@/features/customer-pricing/customer-pricing-workspace';
import RecipeCostingPanel from '@/features/recipe-costing/recipe-costing-panel';
import SupplierPricingPanel from '@/features/supplier-pricing/supplier-pricing-panel';
import { PageHeader } from '@/components/shell';
import { customerOptionRowSchema, customerRowSchema } from '@/domain/customer-pricing';
import { rows } from '@/lib/data';
import hasPermission from '@/lib/permissions';
import { requireAdminShell } from '@/lib/auth';
import { productRowSchema } from '@/domain/recipes';
import { rowSchemas } from '@/domain/master-data';

export default async function PricingPage() {
  const { db, profile } = await requireAdminShell();
  const [canReadProducts, canReadSupplierPricing] = await Promise.all([
    hasPermission(db, 'products.read'),
    hasPermission(db, 'master_data.read'),
  ]);
  const locale = profile.preferred_locale;
  const es = locale === 'es';
  const customerWorkspace = canReadProducts ? await Promise.all([
    rows(db, 'products', productRowSchema),
    rows(db, 'customers', customerRowSchema),
    rows(db, 'customer_product_options', customerOptionRowSchema),
    rows(db, 'uoms', rowSchemas.uoms),
    hasPermission(db, 'products.write'),
  ]) : undefined;
  const [products, customers, options, units, canWrite] = customerWorkspace
    ?? [[], [], [], [], false];
  const orderUnits = units
    .filter((unit) => unit.active && unit.is_purchase_unit)
    .sort((left, right) => left.sort_order - right.sort_order)
    .map((unit) => ({ code: unit.code, label: es ? unit.label_es : unit.label_en }));

  return (
    <>
      <PageHeader
        eyebrow={es ? 'PRECIOS' : 'PRICING'}
        title={es ? 'Precios de compras y ventas' : 'Purchase and sales pricing'}
        description={es
          ? 'Busca artículos, mantén los costos de proveedores y configura listas de precios por cliente.'
          : 'Search items, maintain supplier costs, and configure customer price books.'}
      />
      <div className="stack">
        {canReadSupplierPricing ? <SupplierPricingPanel /> : null}
        {canReadProducts ? (
          <CustomerPricingWorkspace
            products={products}
            customers={customers}
            options={options}
            orderUnits={orderUnits}
            canWrite={canWrite}
            locale={locale}
          />
        ) : null}
        {canReadProducts && canReadSupplierPricing ? <RecipeCostingPanel /> : null}
        {!canReadProducts && !canReadSupplierPricing ? (
          <section className="empty">
            <h2>{es ? 'No tienes acceso a precios' : 'You do not have access to pricing'}</h2>
            <p>
              {es
                ? 'Solicita acceso al catálogo de productos o a los datos maestros de proveedores.'
                : 'Request access to the product catalog or supplier master data.'}
            </p>
          </section>
        ) : null}
      </div>
    </>
  );
}
