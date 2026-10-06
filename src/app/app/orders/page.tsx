import Link from 'next/link';
import { randomUUID } from 'node:crypto';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';
import { PageHeader } from '@/components/shell';
import DirectoryToolbar from '@/components/directory-toolbar';
import CustomerOrderForm from '@/components/customer-order-form';
import CreationDialog from '@/components/creation-dialog';
import CustomerPickupDateForm from '@/components/customer-pickup-date-form';
import OrderProduction from '@/components/order-production';
import OrderRequirements from '@/components/order-requirements';
import { CancelMaterialPlan } from '@/components/purchase-status-form';
import OrderDeactivateAction from '@/components/order-deactivate-action';
import OrderProductionProposal from '@/components/order-production-proposal';
import OrdersToast from '@/components/orders-toast';
import { formatPrice } from '@/domain/customer-pricing';
import { customerOrderLabel } from '@/domain/customer-orders';
import { formatDate, formatNumber } from '@/domain/format';
import loadPurchasingWorkspace from '@/lib/purchasing-data';
import ListGrid, { type ListGridRow } from '@/components/list-grid';
import {
  ORDER_PAGE_SIZE,
  orderDetailHref,
  orderDirectoryHref,
  orderDirectorySorts,
  parseOrderDirectoryQuery,
  type OrderSearchParams,
} from './directory-query';

export default async function Orders({
  searchParams,
}: {
  searchParams: Promise<OrderSearchParams>;
}) {
  const rawQuery = await searchParams;
  const query = z
    .object({
      order: z.uuid().optional(),
      estimate: z.uuid().optional(),
      customer: z.uuid().optional(),
      draft: z.uuid().optional().catch(undefined),
      create: z.literal('order').optional(),
    })
    .refine((value) => !value.order || !value.estimate)
    .safeParse(rawQuery);
  if (!query.success) notFound();
  const selectedId = query.data.order ?? query.data.estimate;
  const workspace = await loadPurchasingWorkspace(selectedId);
  const { selected, requirements, locale } = workspace;
  if (
    query.data.customer
    && !workspace.customers.some((customer) => customer.id === query.data.customer)
  ) notFound();
  const es = locale === 'es';
  const draftId = query.data.draft ?? randomUUID();
  function hasPlanWithStatus(orderId: string, status: 'Active' | 'inactive' | 'any') {
    return workspace.plans.some((plan) => plan.id === orderId
      && (status === 'any' || (status === 'Active' ? plan.status === 'Active' : plan.status !== 'Active')));
  }
  const allOrders = workspace.orders.filter((item) => hasPlanWithStatus(item.id, 'any'));
  const productTypes = [
    ...new Set(allOrders.flatMap((item) => item.items.map((line) => line.product_name))),
  ].sort((left, right) => left.localeCompare(right, locale));
  const directoryQuery = parseOrderDirectoryQuery(
    rawQuery,
    workspace.customers.map((customer) => customer.id),
    productTypes,
  );
  const directoryHref = orderDirectoryHref(directoryQuery);
  const returnParams = new URL(directoryHref, 'https://internal.invalid').searchParams;
  if (query.data.customer) returnParams.set('customer', query.data.customer);
  returnParams.set('draft', draftId);
  const closeOrderHref = `/app/orders?${returnParams}`;
  returnParams.set('create', 'order');
  const orderReturnHref = `/app/orders?${returnParams}`;
  const activeLabel = es ? 'Activo' : 'Active';
  const cancelledLabel = es ? 'Cancelado' : 'Cancelled';
  const productionLabel = es ? 'Producción' : 'Production';
  const unplannedLabel = es ? 'Producción sin planificar' : 'Production not planned';
  const priceMissingLabel = es ? 'Sin configurar' : 'Not set';
  const order = workspace.orders.find((item) => item.id === selectedId);
  if ((selectedId && !selected) || (query.data.order && !order)) notFound();
  const choices = workspace.products.filter(
    (product) => product.active
      && product.standard_batch_gallons === 40
      && workspace.recipes.filter(
        (recipe) => recipe.product_id === product.id
          && workspace.versions.some(
            (version) => version.id === recipe.active_version_id
              && version.recipe_id === recipe.id
              && version.status === 'Released'
              && version.target_yield_gallons === 40,
          ),
      ).length === 1,
  );
  const legacy = workspace.plans.filter(
    (plan) => !workspace.orders.some((item) => item.id === plan.id),
  );
  const activeOrders = allOrders.filter((item) => hasPlanWithStatus(item.id, 'Active'));
  const historicalOrders = allOrders.filter((item) => hasPlanWithStatus(item.id, 'inactive'));
  const availableOrders = directoryQuery.view === 'historical' ? historicalOrders : activeOrders;
  const search = directoryQuery.q.toLocaleLowerCase(locale);
  const filteredOrders = availableOrders
    .filter(
      (item) => !directoryQuery.customerFilter
        || item.customer_id === directoryQuery.customerFilter,
    )
    .filter(
      (item) => !directoryQuery.product
        || item.items.some((line) => line.product_name === directoryQuery.product),
    )
    .filter((item) => !directoryQuery.pickupFrom || item.needed_on >= directoryQuery.pickupFrom)
    .filter((item) => !directoryQuery.pickupTo || item.needed_on <= directoryQuery.pickupTo)
    .filter((item) => {
      const production = workspace.productionPlans.find(
        (plan) => plan.id === item.id && plan.status !== 'Cancelled',
      );
      return (
        !directoryQuery.status
        || (directoryQuery.status === 'unplanned' && !production)
        || production?.status.toLowerCase() === directoryQuery.status
      );
    })
    .filter(
      (item) => !search
        || [
          item.customer_name,
          item.reference,
          item.needed_on,
          formatDate(item.needed_on),
          ...item.items.map((line) => line.product_name),
          workspace.productionPlans.find(
            (plan) => plan.id === item.id && plan.status !== 'Cancelled',
          )?.status ?? unplannedLabel,
        ].some((value) => value.toLocaleLowerCase(locale).includes(search)),
    )
    .toSorted((a, b) => {
      const pickupOrder = a.needed_on.localeCompare(b.needed_on);
      const ordered = directoryQuery.sort === 'pickup-oldest' ? pickupOrder : -pickupOrder;
      return ordered || a.id.localeCompare(b.id);
    });
  const orderRows: ListGridRow[] = filteredOrders.map((item) => {
    const production = workspace.productionPlans.find(
      (plan) => plan.id === item.id && plan.status !== 'Cancelled',
    );
    const batchCount = item.items.reduce((total, line) => total + line.batch_count, 0);
    const products = item.items.map((line) => line.product_name).join(', ');
    const orderHref = orderDetailHref(directoryHref, item.id);
    const actions = [
      {
        label: es ? 'Ver pedido' : 'View order',
        href: orderHref,
      },
    ];
    if (directoryQuery.view !== 'historical') {
      actions.push(
        {
          label: es ? 'Comprar ingredientes' : 'Purchase ingredients',
          href: `/app/purchasing?plan=${item.id}`,
        },
        {
          label: es ? 'Planificar producción' : 'Plan production',
          href: `/app/scheduling?order=${item.id}`,
        },
        {
          label: es ? 'Preparar recogida' : 'Prepare pickup',
          href: `/app/shipping?order=${item.id}`,
        },
      );
    }
    return {
      id: item.id,
      cells: {
        order: {
          text: item.reference || item.id.slice(0, 8),
          href: orderHref,
          secondary: `${products} · ${formatNumber(batchCount)} ${es ? 'lotes' : 'batches'}`,
        },
        customer: { text: item.customer_name },
        pickup: { text: formatDate(item.needed_on), sortValue: item.needed_on },
        production: {
          text: production?.start_on
            ? `${productionLabel} ${formatDate(production.start_on)}`
            : unplannedLabel,
          badge: production?.start_on ? 'default' : 'muted',
        },
        status: {
          text: directoryQuery.view === 'historical' ? cancelledLabel : activeLabel,
          badge: directoryQuery.view === 'historical' ? 'muted' : 'default',
        },
        actions: {
          text: '',
          actions,
          actionsLabel: es ? 'Más acciones' : 'More actions',
        },
      },
    };
  });
  const toolbarFilters = [
    {
      key: 'customerFilter',
      label: es ? 'Cliente' : 'Customer',
      options: workspace.customers
        .map((customer) => ({ value: customer.id, label: customer.name }))
        .sort((a, b) => a.label.localeCompare(b.label, locale)),
    },
    {
      key: 'product',
      label: es ? 'Producto' : 'Product',
      options: productTypes.map((product) => ({ value: product, label: product })),
    },
    {
      key: 'status',
      label: es ? 'Producción' : 'Production',
      options: [
        { value: 'unplanned', label: es ? 'Sin planificar' : 'Not planned' },
        { value: 'draft', label: es ? 'Borrador' : 'Draft' },
        { value: 'confirmed', label: es ? 'Confirmado' : 'Confirmed' },
      ],
    },
    {
      key: 'view',
      label: es ? 'Vista' : 'View',
      options: [{ value: 'historical', label: es ? 'Historial' : 'Historical' }],
    },
  ];
  const toolbarSorts = orderDirectorySorts.map((option) => ({
    ...option,
    label: es
      ? {
        'pickup-newest': 'Recogida más reciente',
        'pickup-oldest': 'Recogida más antigua',
        'customer-desc': 'Cliente Z–A',
      }[option.value]
      : option.label,
  }));
  let noOrdersTitle = es ? 'Aún no hay pedidos activos' : 'No active customer orders yet';
  let noOrdersDescription = es
    ? 'Crea un pedido para planificar ingredientes y producción.'
    : 'Create an order to plan ingredients and production.';
  if (directoryQuery.view === 'historical') {
    noOrdersTitle = es ? 'Aún no hay pedidos históricos' : 'No historical orders yet';
    noOrdersDescription = es
      ? 'Los pedidos desactivados aparecerán aquí.'
      : 'Deactivated orders will appear here.';
  }
  const noMatchesDescription = es
    ? 'Ajusta la búsqueda o los filtros.'
    : 'Adjust the search or filters.';
  let headerAction;
  if (selected) {
    headerAction = (
      <Link
        className="button secondary"
        href={`${directoryHref}${query.data.order ? `#order-${query.data.order}` : ''}`}
      >
        {es ? 'Volver a pedidos' : 'Back to orders'}
      </Link>
    );
  } else if (workspace.canOrder) {
    headerAction = (
      <Link className="button button--compact" href={orderReturnHref} scroll={false}>
        {es ? 'Nuevo pedido' : 'New order'}
      </Link>
    );
  }
  return (
    <>
      <PageHeader
        eyebrow={es ? 'DEL PEDIDO A LAS COMPRAS' : 'ORDERS, PURCHASING & PRODUCTION'}
        title={es ? 'Pedidos' : 'Orders'}
        description={
          es
            ? 'Registra productos, lotes y fecha de recogida. El pedido calcula ingredientes, revisa inventario y prepara la estimación de compras.'
            : 'Choose a customer, package prices, batches and pickup date. Each order calculates ingredients and connects purchasing to production preparation.'
        }
        action={headerAction}
      />
      {selected ? (
        <>
          <section className="panel">
            <h2>{order ? customerOrderLabel(order) : selected.name}</h2>
            {order && selected.status === 'Active' && workspace.canOrder ? (
              <OrderProductionProposal
                orderId={order.id}
                orderLabel={customerOrderLabel(order)}
                locale={locale}
              />
            ) : null}
            {order && (
              <p>
                <Link className="button secondary" href={`/app/scheduling?order=${order.id}`}>
                  {es ? 'Planificar producción' : 'Plan Production'}
                </Link>
              </p>
            )}
            {order && (
              <p>
                <Link href={`/app/shipping?order=${order.id}`}>
                  {es ? 'Preparar envío / recogida' : 'Prepare shipment / pickup'}
                </Link>
              </p>
            )}
            <p>{`${es ? 'Fecha de recogida' : 'Pickup date'} ${formatDate(selected.needed_on)} · ${selected.status === 'Active' ? activeLabel : cancelledLabel}`}</p>
            {order && selected.status === 'Active' && workspace.canOrder && (
              <CustomerPickupDateForm
                orderId={order.id}
                pickupDate={order.needed_on}
                locale={locale}
              />
            )}
            {order && workspace.canOrder ? (
              <OrderDeactivateAction
                orderId={order.id}
                orderLabel={customerOrderLabel(order)}
                locale={locale}
                returnToDirectory
              />
            ) : null}
            {order ? (
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">
                    {es ? 'Productos pedidos' : 'Ordered products'}
                  </caption>
                  <thead>
                    <tr>
                      {(es
                        ? [
                          'Producto',
                          'Lotes',
                          'Galones',
                          'Empaque',
                          'Precio por unidad',
                          'Total',
                          'Receta guardada',
                        ]
                        : [
                          'Product',
                          'Batches',
                          'Gallons',
                          'Packaging',
                          'Unit price',
                          'Line total',
                          'Saved recipe',
                        ]
                      ).map((heading) => (
                        <th key={heading} scope="col">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {order.items.map((item) => (
                      <tr key={item.product_id}>
                        <th scope="row">{item.product_name}</th>
                        <td>{formatNumber(item.batch_count)}</td>
                        <td>{formatNumber(item.batch_count * item.batch_gallons)}</td>
                        <td>{`${formatNumber(item.unit_count)} × ${item.packaging_label} (${formatNumber(item.gallons_per_unit)} gal / ${item.unit_name})`}</td>
                        <td>
                          {item.unit_price === null
                            ? priceMissingLabel
                            : `${formatPrice(item.unit_price)} / ${item.unit_name}`}
                        </td>
                        <td>{item.line_total === null ? '—' : formatPrice(item.line_total)}</td>
                        <td>{`v${item.version_number}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <p className="notice">
                {es
                  ? 'Estimación anterior sin pedido de cliente vinculado.'
                  : 'Earlier estimate with no linked customer order.'}
              </p>
            )}
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
          <OrderRequirements
            plan={selected}
            requirements={requirements}
            locale={locale}
            productionStart={
              workspace.production?.status !== 'Cancelled'
                ? workspace.production?.start_on
                : undefined
            }
          />
          {selected.status === 'Active' && workspace.canWrite && (!order || workspace.canOrder) && (
            <section className="panel">
              <details>
                <summary>
                  {es ? 'Cancelar y liberar compromisos' : 'Cancel & release commitments'}
                </summary>
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
            <Suspense fallback={null}>
              <DirectoryToolbar
                label={es ? 'Filtros de pedidos' : 'Order filters'}
                resultCount={filteredOrders.length}
                filters={toolbarFilters}
                sortOptions={toolbarSorts}
                dateRange={{
                  fromKey: 'pickupFrom',
                  toKey: 'pickupTo',
                  fromLabel: es ? 'Recogida desde' : 'Pickup from',
                  toLabel: es ? 'Recogida hasta' : 'Pickup through',
                }}
                locale={locale}
                mobileFilters
              />
            </Suspense>
            {!availableOrders.length && (
              <div className="empty order-empty-state">
                <h3>{noOrdersTitle}</h3>
                <p>{noOrdersDescription}</p>
                {directoryQuery.view === 'historical' ? (
                  <Link href="/app/orders">
                    {es ? 'Ver pedidos activos' : 'View active orders'}
                  </Link>
                ) : null}
                {directoryQuery.view !== 'historical' && workspace.canOrder && (
                  <Link href={orderReturnHref} scroll={false}>{es ? 'Crear pedido' : 'Create order'}</Link>
                )}
              </div>
            )}
            {!!availableOrders.length && !filteredOrders.length && (
              <div className="empty order-empty-state">
                <h3>{es ? 'No hay pedidos en esta vista' : 'No orders in this view'}</h3>
                <p>{noMatchesDescription}</p>
                <Link href="/app/orders">{es ? 'Borrar filtros' : 'Clear all'}</Link>
              </div>
            )}
            {!!filteredOrders.length && (
              <ListGrid
                label={es ? 'Pedidos guardados' : 'Saved customer orders'}
                locale={locale}
                rows={orderRows}
                columns={[
                  {
                    key: 'order', label: es ? 'Pedido' : 'Order', minWidth: 230, flex: 2,
                  },
                  {
                    key: 'customer', label: es ? 'Cliente' : 'Customer', minWidth: 170, flex: 1,
                  },
                  { key: 'pickup', label: es ? 'Recogida' : 'Pickup', minWidth: 130 },
                  { key: 'production', label: productionLabel, minWidth: 190 },
                  { key: 'status', label: es ? 'Estado' : 'Status', minWidth: 115 },
                  {
                    key: 'actions',
                    label: es ? 'Acciones' : 'Actions',
                    minWidth: 300,
                    flex: 2,
                    sortable: false,
                    filterable: false,
                  },
                ]}
                pageSize={ORDER_PAGE_SIZE}
              />
            )}
          </section>
          {workspace.canOrder && (
            <CreationDialog
              open={query.data.create === 'order'}
              title={es ? 'Nuevo pedido' : 'New order'}
              closeHref={closeOrderHref}
              closeLabel={es ? 'Cerrar nuevo pedido' : 'Close new order'}
            >
              <CustomerOrderForm
                key={query.data.customer ?? 'new'}
                initialCustomerId={query.data.customer}
                draftId={draftId}
                returnHref={orderReturnHref}
                choices={choices}
                customers={workspace.customers}
                options={workspace.customerOptions}
                locale={locale}
              />
            </CreationDialog>
          )}
          {!!legacy.length && (
            <section className="panel">
              <details>
                <summary>{es ? 'Estimaciones anteriores' : 'Earlier estimates'}</summary>
                {legacy.map((plan) => (
                  <p key={plan.id}>
                    <Link href={`/app/orders?estimate=${plan.id}`}>{plan.name}</Link>
                  </p>
                ))}
              </details>
            </section>
          )}
        </>
      )}
    </>
  );
}
