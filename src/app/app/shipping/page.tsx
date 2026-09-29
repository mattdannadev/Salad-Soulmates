import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';
import DirectoryToolbar from '@/components/directory-toolbar';
import { PageHeader } from '@/components/shell';
import ShippingDraftForm from '@/components/shipping-draft-form';
import { customerOrderLabel } from '@/domain/customer-orders';
import { formatDate, formatNumber } from '@/domain/format';
import loadShippingWorkspace from '@/lib/shipping-data';
import {
  SHIPPING_PAGE_SIZE, parseShippingDirectoryQuery, selectShippingOrders,
  shippingDirectoryHref, shippingDirectorySorts, shippingOrderHref,
  type ShippingSearchParams,
} from './directory-query';

export default async function Shipping({ searchParams }: {
  searchParams: Promise<ShippingSearchParams>;
}) {
  const rawQuery = await searchParams;
  const query = z.object({ order: z.uuid().optional() }).safeParse(rawQuery);
  if (!query.success) notFound();
  const {
    orders, plans, drafts, canWrite, locale,
  } = await loadShippingWorkspace();
  const es = locale === 'es';
  const openLabel = es ? 'Abierto' : 'Open';
  const inactiveLabel = es ? 'No activo' : 'Inactive';
  const pickupLabel = es ? 'Recogida' : 'Pickup';
  const shipmentLabel = es ? 'Envío' : 'Shipment';
  const selected = orders.find((order) => order.id === query.data.order);
  if (query.data.order && !selected) notFound();
  const active = plans.find((plan) => plan.id === selected?.id)?.status === 'Active';
  const customers = [...new Map(orders.map((order) => [order.customer_id, order.customer_name]))]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, locale));
  const pickupDates = [...new Set(orders.map((order) => order.needed_on))].sort();
  const customerIds = customers.map((item) => item.value);
  const directoryQuery = parseShippingDirectoryQuery(rawQuery, customerIds, pickupDates);
  const directoryHref = shippingDirectoryHref(directoryQuery);
  const matchingOrders = selectShippingOrders(orders, plans, directoryQuery, locale);
  const pageCount = Math.max(1, Math.ceil(matchingOrders.length / SHIPPING_PAGE_SIZE));
  const visibleOrders = matchingOrders.slice(
    (directoryQuery.page - 1) * SHIPPING_PAGE_SIZE,
    directoryQuery.page * SHIPPING_PAGE_SIZE,
  );
  const toolbarFilters = [
    { key: 'customerFilter', label: es ? 'Cliente' : 'Customer', options: customers },
    { key: 'pickup', label: es ? 'Fecha de recogida' : 'Pickup date', options: pickupDates.map((date) => ({ value: date, label: formatDate(date) })) },
    {
      key: 'status',
      label: es ? 'Estado del pedido' : 'Order status',
      options: [
        { value: 'active', label: openLabel },
        { value: 'inactive', label: inactiveLabel },
      ],
    },
  ];
  const sortOptions = shippingDirectorySorts.map((option) => ({
    ...option,
    label: es ? ({ 'pickup-oldest': 'Recogida más próxima', 'pickup-newest': 'Recogida más reciente', customer: 'Cliente A–Z' })[option.value] : option.label,
  }));
  return (
    <>
      <PageHeader eyebrow={es ? 'PREPARACIÓN' : 'PREPARATION'} title={es ? 'Borradores de envío' : 'Shipping drafts'} description={es ? 'Prepara cantidades de pedidos existentes para envío o recogida.' : 'Prepare quantities from existing customer orders for shipment or pickup.'} />
      <section className="panel">
        <p className="notice">{es ? 'Confirmación pendiente de empaque. Aún no se pueden seleccionar lotes, descontar producto terminado ni registrar entregas o devoluciones.' : 'Confirmation awaits packaging. Lot selection, finished-stock deductions, delivery confirmation and returns are not available yet.'}</p>
        <button type="button" disabled>{es ? 'Confirmar envío / recogida — no disponible' : 'Confirm shipment / pickup — unavailable'}</button>
      </section>
      {!selected ? (
        <section className="panel">
          <h2>{es ? 'Pedidos de clientes' : 'Customer orders'}</h2>
          <Suspense fallback={null}>
            <DirectoryToolbar label={es ? 'Buscar pedidos para envío' : 'Search orders for shipping'} resultCount={matchingOrders.length} filters={toolbarFilters} sortOptions={sortOptions} locale={locale} pageCount={pageCount} mobileFilters />
          </Suspense>
          {!orders.length && (
            <p className="empty">
              {es ? 'Aún no hay pedidos. Crea uno para preparar un envío o recogida.' : 'No customer orders yet. Create one to prepare shipment or pickup.'}
              {' '}
              <Link href="/app/orders">{es ? 'Crear pedido' : 'Create order'}</Link>
            </p>
          )}
          {orders.length > 0 && !visibleOrders.length && (
            <p className="empty">
              {es ? 'No hay pedidos en esta vista. Cambia o borra los filtros.' : 'No orders in this view. Change or clear the filters.'}
              {' '}
              {' '}
              <Link href="/app/shipping">{es ? 'Borrar filtros' : 'Clear filters'}</Link>
            </p>
          )}
          <div className="worksheet-links">
            {visibleOrders.map((order) => (
              <Link className="worksheet-link" key={order.id} href={shippingOrderHref(directoryHref, order.id)}>
                <strong>{customerOrderLabel(order)}</strong>
                <span>{formatDate(order.needed_on)}</span>
                <span>{plans.find((plan) => plan.id === order.id)?.status === 'Active' ? openLabel : inactiveLabel}</span>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <>
          <section className="panel">
            <h2>{customerOrderLabel(selected)}</h2>
            <p>{`${es ? 'Necesario para' : 'Needed by'} ${formatDate(selected.needed_on)}`}</p>
            <p>
              <Link href={`/app/orders?order=${selected.id}`}>{es ? 'Ver pedido' : 'View order'}</Link>
              {' · '}
              <Link href={directoryHref}>{es ? 'Todos los pedidos' : 'All orders'}</Link>
            </p>
            {active && canWrite ? <ShippingDraftForm key={selected.id} order={selected} locale={locale} /> : <p>{es ? 'Este pedido no permite nuevos borradores con tu acceso actual.' : 'This order is not available for new drafts with your current access.'}</p>}
          </section>
          <section className="panel">
            <h2>{es ? 'Borradores guardados — no son entregas' : 'Saved drafts — not deliveries'}</h2>
            {!drafts.some((draft) => draft.order_id === selected.id) && <p className="empty">{es ? 'Aún no hay borradores.' : 'No drafts yet.'}</p>}
            {drafts.filter((draft) => draft.order_id === selected.id)
              .toSorted((a, b) => b.created_at.localeCompare(a.created_at)).map((draft) => (
                <article key={draft.id}>
                  <h3>{`${formatDate(draft.planned_on)} · ${draft.method === 'Pickup' ? pickupLabel : shipmentLabel}`}</h3>
                  <p>{`${es ? 'Guardado' : 'Saved'} ${formatDate(draft.created_at)} · ${draft.id}`}</p>
                  <ul>
                    {draft.lines.map((line) => {
                      const item = selected.items.find(
                        (entry) => entry.product_id === line.product_id,
                      );
                      return <li key={line.product_id}>{`${item?.product_name ?? line.product_id}: ${formatNumber(line.quantity)} ${item?.unit_name ?? ''} · ${item?.packaging_label ?? ''}`}</li>;
                    })}
                  </ul>
                  {draft.note && <p>{draft.note}</p>}
                </article>
              ))}
          </section>
        </>
      )}
    </>
  );
}
