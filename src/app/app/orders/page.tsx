import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/shell';
import CustomerOrderForm from '@/components/customer-order-form';
import OrderProduction from '@/components/order-production';
import OrderRequirements from '@/components/order-requirements';
import { CancelMaterialPlan } from '@/components/purchase-status-form';
import { formatPrice } from '@/domain/customer-pricing';
import { customerOrderLabel } from '@/domain/customer-orders';
import { formatDate, formatNumber } from '@/domain/format';
import loadPurchasingWorkspace from '@/lib/purchasing-data';

export default async function Orders({ searchParams }: {
  searchParams: Promise<{ order?: string; estimate?: string }>;
}) {
  const query = z.object({ order: z.uuid().optional(), estimate: z.uuid().optional() })
    .refine((value) => !value.order || !value.estimate).safeParse(await searchParams);
  if (!query.success) notFound();
  const selectedId = query.data.order ?? query.data.estimate;
  const workspace = await loadPurchasingWorkspace(selectedId);
  const { selected, requirements, locale } = workspace;
  const es = locale === 'es';
  const activeLabel = es ? 'Activo' : 'Active';
  const cancelledLabel = es ? 'Cancelado' : 'Cancelled';
  const productionLabel = es ? 'Producción' : 'Production';
  const unplannedLabel = es ? 'Producción sin planificar' : 'Production not planned';
  const priceMissingLabel = es ? 'Sin configurar' : 'Not set';
  const order = workspace.orders.find((item) => item.id === selectedId);
  if ((selectedId && !selected) || (query.data.order && !order)) notFound();
  const choices = workspace.products.filter((product) => (
    product.active && product.standard_batch_gallons === 40
    && workspace.recipes.filter((recipe) => recipe.product_id === product.id
      && workspace.versions.some((version) => version.id === recipe.active_version_id
        && version.recipe_id === recipe.id && version.status === 'Released'
        && version.target_yield_gallons === 40)).length === 1
  ));
  const legacy = workspace.plans.filter(
    (plan) => !workspace.orders.some((item) => item.id === plan.id),
  );
  return (
    <>
      <PageHeader
        eyebrow={es ? 'DEL PEDIDO A LAS COMPRAS' : 'ORDERS, PURCHASING & PRODUCTION'}
        title={es ? 'Pedidos de clientes' : 'Customer orders'}
        description={es
          ? 'Registra productos, lotes y fecha requerida. El pedido calcula ingredientes, revisa inventario y prepara la estimación de compras.'
          : 'Capture products, batches and the needed date. Each order calculates ingredients, checks inventory and connects purchasing to production preparation.'}
        action={selected ? <Link className="button secondary" href="/app/orders">{es ? 'Todos los pedidos / nuevo pedido' : 'All orders / new order'}</Link> : undefined}
      />
      {selected ? (
        <>
          <section className="panel">
            <h2>{order ? customerOrderLabel(order) : selected.name}</h2>
            {order && <p><Link href={`/app/shipping?order=${order.id}`}>{es ? 'Preparar envío / recogida' : 'Prepare shipment / pickup'}</Link></p>}
            <p>{`${es ? 'Necesario para' : 'Needed by'} ${formatDate(selected.needed_on)} · ${selected.status === 'Active' ? activeLabel : cancelledLabel}`}</p>
            {order ? (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">{es ? 'Productos pedidos' : 'Ordered products'}</caption>
                  <thead>
                    <tr>
                      {(es ? ['Producto', 'Lotes', 'Galones', 'Empaque', 'Precio por unidad', 'Total', 'Receta guardada'] : ['Product', 'Batches', 'Gallons', 'Packaging', 'Unit price', 'Line total', 'Saved recipe'])
                        .map((heading) => <th key={heading} scope="col">{heading}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.product_id}>
                        <th scope="row">{item.product_name}</th>
                        <td>{formatNumber(item.batch_count)}</td>
                        <td>{formatNumber(item.batch_count * item.batch_gallons)}</td>
                        <td>{`${formatNumber(item.unit_count)} × ${item.packaging_label} (${formatNumber(item.gallons_per_unit)} gal / ${item.unit_name})`}</td>
                        <td>{item.unit_price === null ? priceMissingLabel : `${formatPrice(item.unit_price)} / ${item.unit_name}`}</td>
                        <td>{item.line_total === null ? '—' : formatPrice(item.line_total)}</td>
                        <td>{`v${item.version_number}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : <p className="notice">{es ? 'Estimación anterior sin pedido de cliente vinculado.' : 'Earlier estimate with no linked customer order.'}</p>}
          </section>
          {order && (
          <OrderProduction
            order={order}
            plan={workspace.production}
            batches={workspace.productionBatches}
            requirements={requirements}
            canWrite={workspace.canOrder}
            active={selected.status === 'Active'}
            locale={locale}
          />
          )}
          <OrderRequirements plan={selected} requirements={requirements} locale={locale} productionStart={workspace.production?.status !== 'Cancelled' ? workspace.production?.start_on : undefined} />
          {selected.status === 'Active'
            && workspace.canWrite && (!order || workspace.canOrder) && (
            <section className="panel">
              <details>
                <summary>{es ? 'Cancelar y liberar compromisos' : 'Cancel & release commitments'}</summary>
                <CancelMaterialPlan
                  id={selected.id}
                  locale={locale}
                  customerOrder={Boolean(order)}
                />
              </details>
            </section>
          )}
        </>
      ) : (
        <>
          <section className="panel">
            <h2>{es ? 'Pedidos guardados' : 'Saved customer orders'}</h2>
            {!workspace.orders.length && <p className="empty">{es ? 'Aún no hay pedidos de clientes.' : 'No customer orders yet.'}</p>}
            <div className="worksheet-links">
              {workspace.orders.toSorted((a, b) => b.created_at.localeCompare(a.created_at))
                .map((item) => (
                  <Link className="worksheet-link" href={`/app/orders?order=${item.id}`} key={item.id}>
                    <strong>{customerOrderLabel(item)}</strong>
                    <span>{formatDate(item.needed_on)}</span>
                    <span>{workspace.plans.find((plan) => plan.id === item.id)?.status === 'Cancelled' ? cancelledLabel : activeLabel}</span>
                    <span>
                      {workspace.productionPlans.find((plan) => plan.id === item.id && plan.status !== 'Cancelled')?.start_on
                        ? `${productionLabel} ${formatDate(workspace.productionPlans.find((plan) => plan.id === item.id)?.start_on ?? '')}`
                        : unplannedLabel}
                    </span>
                  </Link>
                ))}
            </div>
          </section>
          {workspace.canOrder && (
          <section className="panel">
            <h2>{es ? 'Nuevo pedido de cliente' : 'New customer order'}</h2>
            <CustomerOrderForm
              choices={choices}
              customers={workspace.customers}
              options={workspace.customerOptions}
              locale={locale}
            />
          </section>
          )}
          {!!legacy.length && (
          <section className="panel">
            <details>
              <summary>{es ? 'Estimaciones anteriores' : 'Earlier estimates'}</summary>
              {legacy.map((plan) => <p key={plan.id}><Link href={`/app/orders?estimate=${plan.id}`}>{plan.name}</Link></p>)}
            </details>
          </section>
          )}
        </>
      )}
    </>
  );
}
