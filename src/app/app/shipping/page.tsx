import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/shell';
import ShippingDraftForm from '@/components/shipping-draft-form';
import { customerOrderLabel } from '@/domain/customer-orders';
import { formatDate, formatNumber } from '@/domain/format';
import loadShippingWorkspace from '@/lib/shipping-data';

export default async function Shipping({ searchParams }: {
  searchParams: Promise<{ order?: string }>;
}) {
  const query = z.object({ order: z.uuid().optional() }).safeParse(await searchParams);
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
          {!orders.length && <p className="empty">{es ? 'Aún no hay pedidos.' : 'No customer orders yet.'}</p>}
          <div className="worksheet-links">
            {orders.toSorted((a, b) => a.needed_on.localeCompare(b.needed_on)).map((order) => (
              <Link className="worksheet-link" key={order.id} href={`/app/shipping?order=${order.id}`}>
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
              <Link href="/app/shipping">{es ? 'Todos los pedidos' : 'All orders'}</Link>
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
