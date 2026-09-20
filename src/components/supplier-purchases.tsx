import Link from 'next/link';
import { customerOrderLabel } from '@/domain/customer-orders';
import { formatDate } from '@/domain/format';
import type { Supplier } from '@/domain/master-data';
import { purchaseProgress, purchaseStatusLabel, supplierCustomerOrders } from '@/domain/supplier-orders';
import type loadSupplierWorkspace from '@/lib/supplier-data';
import PurchaseOrderCard from './purchase-order-card';

const RECENT_PURCHASE_LIMIT = 5;

export default function SupplierPurchases({ supplier, workspace }: {
  supplier: Supplier;
  workspace: Awaited<ReturnType<typeof loadSupplierWorkspace>>;
}) {
  const {
    locale, canWrite, lines, receipts,
  } = workspace;
  const es = locale === 'es';
  if (!workspace.canReadPurchases) {
    return <p>{es ? 'Tu acceso no incluye los pedidos de compra.' : 'Purchase orders are unavailable with your access.'}</p>;
  }
  const purchases = workspace.drafts.filter((draft) => draft.supplier_id === supplier.id)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const orders = supplierCustomerOrders(
    supplier.id,
    workspace.orders,
    workspace.plans,
    workspace.packs,
    purchases,
  );
  const customerIds = [...new Set(orders.map((order) => order.customer_id))];
  return (
    <div className="supplier-purchases">
      <div className="section-heading">
        <h3>{es ? 'Pedidos de compra recientes' : 'Recent purchase orders'}</h3>
        {canWrite && supplier.active && (
          <Link className="button" href={`/app/purchasing?supplier=${supplier.id}`}>
            {es ? 'Nueva orden de compra' : 'New purchase order'}
          </Link>
        )}
      </div>
      {!supplier.active && <p>{es ? 'Proveedor inactivo: solo historial.' : 'Inactive supplier: order history only.'}</p>}
      {!purchases.length && <p>{es ? 'Aún no hay pedidos de compra para este proveedor.' : 'No purchase orders for this supplier yet.'}</p>}
      {purchases.slice(0, RECENT_PURCHASE_LIMIT).map((draft) => {
        const order = workspace.orders.find((item) => item.id === draft.material_plan_id);
        const plan = workspace.plans.find((item) => item.id === draft.material_plan_id);
        return (
          <PurchaseOrderCard
            key={draft.id}
            draft={draft}
            lines={lines}
            receipts={receipts}
            supplierName={supplier.name}
            orderLabel={order ? customerOrderLabel(order) : `${es ? 'Estimación anterior' : 'Earlier estimate'} · ${plan?.name ?? ''}`}
            neededOn={order?.needed_on ?? plan?.needed_on}
            canWrite={canWrite}
            locale={locale}
          />
        );
      })}
      {purchases.length > RECENT_PURCHASE_LIMIT && (
        <Link href={`/app/purchasing?supplier=${supplier.id}`}>
          {es ? `Ver las ${purchases.length} compras` : `View all ${purchases.length} purchase orders`}
        </Link>
      )}
      <section className="supplier-demand">
        <h3>{es ? 'Pedidos pendientes por cliente' : 'Outstanding orders by customer'}</h3>
        <p>
          {es
            ? 'Pedidos activos que utilizan ingredientes de este proveedor. La fecha del cliente y la entrega del proveedor se muestran por separado.'
            : 'Active customer orders using ingredients from this supplier. Customer due dates and supplier deliveries are shown separately.'}
        </p>
        {!orders.length && <p>{es ? 'No hay pedidos de clientes relacionados.' : 'No outstanding customer orders for this supplier.'}</p>}
        {customerIds.map((customerId) => (
          <section className="supplier-customer" key={customerId}>
            <h4>{orders.find((order) => order.customer_id === customerId)?.customer_name}</h4>
            {orders.filter((order) => order.customer_id === customerId).map((order) => {
              const linked = purchases.filter((draft) => draft.material_plan_id === order.id);
              return (
                <div className="supplier-customer-order" key={order.id}>
                  <Link href={`/app/orders?order=${order.id}`}>{order.reference || order.id.slice(0, 8)}</Link>
                  <dl className="purchase-dates">
                    <div>
                      <dt>{es ? 'Pedido creado' : 'Order placed'}</dt>
                      <dd>{formatDate(order.created_at)}</dd>
                    </div>
                    <div>
                      <dt>{es ? 'Cliente necesita para' : 'Customer needs by'}</dt>
                      <dd>{formatDate(order.needed_on)}</dd>
                    </div>
                  </dl>
                  <p>{order.items.map((item) => `${item.product_name} · ${item.batch_count} ${es ? 'lotes' : 'batches'}`).join(', ')}</p>
                  {!linked.length && <p>{es ? 'Sin orden de compra' : 'No purchase order yet'}</p>}
                  {linked.map((draft) => (
                    <p key={draft.id}>
                      <Link href={`/app/purchasing?supplier=${supplier.id}&plan=${order.id}#purchase-${draft.id}`}>
                        {draft.reference || draft.id.slice(0, 8)}
                      </Link>
                      {` · ${purchaseStatusLabel(purchaseProgress(draft, lines, receipts).status, locale)} · ${es ? 'Entrega prevista' : 'Expected delivery'}: ${formatDate(draft.expected_on)}`}
                    </p>
                  ))}
                  {canWrite && supplier.active && (
                    <Link href={`/app/purchasing?supplier=${supplier.id}&plan=${order.id}`}>
                      {es ? 'Preparar compra para este pedido' : 'Prepare purchase for this order'}
                    </Link>
                  )}
                </div>
              );
            })}
          </section>
        ))}
      </section>
    </div>
  );
}
