import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/shell';
import CustomerOrderForm from '@/components/customer-order-form';
import OrderCardDetails from '@/components/order-card-details';
import OrderProduction from '@/components/order-production';
import OrderRequirements from '@/components/order-requirements';
import { CancelMaterialPlan } from '@/components/purchase-status-form';
import OrderDeactivateAction from '@/components/order-deactivate-action';
import OrdersToast from '@/components/orders-toast';
import { formatPrice } from '@/domain/customer-pricing';
import { customerOrderLabel } from '@/domain/customer-orders';
import { formatDate, formatNumber } from '@/domain/format';
import loadPurchasingWorkspace from '@/lib/purchasing-data';
import orderCards from '@/services/order-cards';

export default async function Orders({ searchParams }: {
  searchParams: Promise<{
    order?: string;
    estimate?: string;
    customer?: string;
    q?: string;
    product?: string;
    status?: string;
  }>;
}) {
  const query = z.object({
    order: z.uuid().optional(),
    estimate: z.uuid().optional(),
    customer: z.uuid().optional(),
    q: z.string().trim().max(120).catch(''),
    product: z.string().trim().max(120).catch('all'),
    status: z.enum(['all', 'unplanned', 'draft', 'confirmed']).catch('all'),
  })
    .refine((value) => !value.order || !value.estimate).safeParse(await searchParams);
  if (!query.success) notFound();
  const selectedId = query.data.order ?? query.data.estimate;
  const workspace = await loadPurchasingWorkspace(selectedId);
  const { selected, requirements, locale } = workspace;
  if (query.data.customer
    && !workspace.customers.some((customer) => customer.id === query.data.customer)) notFound();
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
  const {
    orders, customers, plans, productionPlans,
  } = workspace;
  const savedCards = orderCards(orders, customers, plans, productionPlans);
  const cardsById = new Map(savedCards.map((card) => [card.order.id, card]));
  const activeOrders = workspace.orders.filter((item) => (
    workspace.plans.find((plan) => plan.id === item.id)?.status === 'Active'
  ));
  const productTypes = [...new Set(activeOrders.flatMap(
    (item) => item.items.map((line) => line.product_name),
  ))].sort();
  const search = query.data.q.toLowerCase();
  const directoryOrders = activeOrders
    .filter((item) => query.data.product === 'all' || item.items.some((line) => line.product_name === query.data.product))
    .filter((item) => {
      const production = workspace.productionPlans.find((plan) => plan.id === item.id && plan.status !== 'Cancelled');
      return query.data.status === 'all'
        || (query.data.status === 'unplanned' && !production)
        || production?.status.toLowerCase() === query.data.status;
    })
    .filter((item) => !search || [
      item.customer_name,
      item.reference,
      item.needed_on,
      formatDate(item.needed_on),
      ...item.items.map((line) => line.product_name),
      workspace.productionPlans.find((plan) => plan.id === item.id && plan.status !== 'Cancelled')?.status ?? unplannedLabel,
    ].some((value) => value.toLowerCase().includes(search)))
    .toSorted((a, b) => b.needed_on.localeCompare(a.needed_on));
  return (
    <>
      <PageHeader
        eyebrow={es ? 'DEL PEDIDO A LAS COMPRAS' : 'ORDERS, PURCHASING & PRODUCTION'}
        title={es ? 'Pedidos' : 'Orders'}
        description={es
          ? 'Registra productos, lotes y fecha de recogida. El pedido calcula ingredientes, revisa inventario y prepara la estimación de compras.'
          : 'Choose a customer, package prices, batches and pickup date. Each order calculates ingredients and connects purchasing to production preparation.'}
        action={selected ? <Link className="button secondary" href="/app/orders">{es ? 'Todos los pedidos / nuevo pedido' : 'All orders / new order'}</Link> : undefined}
      />
      {selected ? (
        <>
          <section className="panel">
            <h2>{order ? customerOrderLabel(order) : selected.name}</h2>
            {order && <p><Link href={`/app/shipping?order=${order.id}`}>{es ? 'Preparar envío / recogida' : 'Prepare shipment / pickup'}</Link></p>}
            <p>{`${es ? 'Fecha de recogida' : 'Pickup date'} ${formatDate(selected.needed_on)} · ${selected.status === 'Active' ? activeLabel : cancelledLabel}`}</p>
            {order && selected.status === 'Active' && workspace.canOrder ? (
              <OrderDeactivateAction
                orderId={order.id}
                orderLabel={customerOrderLabel(order)}
                returnToDirectory
              />
            ) : null}
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
            lots={workspace.productionLots.filter((lot) => lot.order_id === order.id)}
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
            <OrdersToast />
            <form className="search inventory-filters order-filters">
              <label className="inventory-filter-search" htmlFor="order-search">
                <span className="sr-only">Search orders</span>
                <input id="order-search" name="q" placeholder="Search customer, pickup date, product, or status…" defaultValue={query.data.q} />
              </label>
              <label className="inventory-filter-field" htmlFor="order-product">
                <span>Product type</span>
                <select id="order-product" name="product" defaultValue={query.data.product}>
                  <option value="all">All products</option>
                  {productTypes.map((product) => (
                    <option key={product} value={product}>{product}</option>
                  ))}
                </select>
              </label>
              <label className="inventory-filter-field" htmlFor="order-status">
                <span>Production status</span>
                <select id="order-status" name="status" defaultValue={query.data.status}>
                  <option value="all">All statuses</option>
                  <option value="unplanned">Not planned</option>
                  <option value="draft">Draft</option>
                  <option value="confirmed">Confirmed</option>
                </select>
              </label>
              <button type="submit" className="secondary">Filter</button>
              <Link className="inventory-clear-filters" href="/app/orders" aria-label="Clear order filters" title="Clear filters">
                <span aria-hidden="true">×</span>
                <span>Clear</span>
              </Link>
            </form>
            {!activeOrders.length && <p className="empty order-empty-state">{es ? 'Aún no hay pedidos activos.' : 'No active customer orders.'}</p>}
            {activeOrders.length > 0 && !directoryOrders.length && <p className="empty order-empty-state">No active orders match these filters.</p>}
            <div className="orders-by-customer">
              {Object.entries(Object.groupBy(directoryOrders, (item) => item.customer_name))
                .toSorted(([a], [b]) => a.localeCompare(b))
                .map(([customerName, customerOrders]) => (
                  <section className="order-customer-group" key={customerName} aria-label={`${customerName} active orders`}>
                    <h3>
                      <span className="order-customer-label">Customer</span>
                      <span>{customerName}</span>
                      <span className="order-customer-count">{`${customerOrders?.length ?? 0} ${(customerOrders?.length ?? 0) === 1 ? 'order' : 'orders'}`}</span>
                    </h3>
                    <div className="orders-grid">
                      {customerOrders?.map((item) => {
                        const card = cardsById.get(item.id);
                        if (!card) throw new Error('Saved order card missing');
                        const production = workspace.productionPlans.find((plan) => plan.id === item.id && plan.status !== 'Cancelled');
                        const productionText = production?.start_on
                          ? `${productionLabel} ${formatDate(production.start_on)}`
                          : unplannedLabel;
                        return (
                          <article className="order-card" key={item.id}>
                            <div className="order-card-main">
                              <p className="order-card-reference">{item.reference || item.id.slice(0, 8)}</p>
                              <h4><Link href={`/app/orders?order=${item.id}`}>{formatDate(item.needed_on)}</Link></h4>
                              <OrderCardDetails card={card} locale={locale} />
                              <div className="order-card-badges">
                                <span className="badge">{activeLabel}</span>
                                <span className="badge">{productionText}</span>
                              </div>
                            </div>
                            <div className="order-card-actions">
                              <Link className="button secondary" href={`/app/orders?order=${item.id}`}>View order</Link>
                              <Link className="button secondary" href={`/app/purchasing?plan=${item.id}`}>Purchase ingredients</Link>
                              <Link className="button secondary" href={`/app/shipping?order=${item.id}`}>Prepare pickup</Link>
                              {workspace.canOrder ? (
                                <OrderDeactivateAction
                                  orderId={item.id}
                                  orderLabel={customerOrderLabel(item)}
                                />
                              ) : null}
                            </div>
                          </article>
                        );
                      })}
                    </div>
                  </section>
                ))}
            </div>
          </section>
          {workspace.canOrder && (
          <section className="panel">
            <h2 id="new-order">{es ? 'Nuevo pedido' : 'New order'}</h2>
            <CustomerOrderForm
              key={query.data.customer ?? 'new'}
              initialCustomerId={query.data.customer}
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
