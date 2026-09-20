import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import loadPurchasingWorkspace from '@/lib/purchasing-data';
import { PageHeader } from '@/components/shell';
import PurchaseComposer from '@/components/purchase-composer';
import PurchaseOrderCard from '@/components/purchase-order-card';
import { formatDate } from '@/domain/format';
import { customerOrderLabel } from '@/domain/customer-orders';

export default async function Purchasing({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string | string[]; supplier?: string | string[] }>;
}) {
  const query = z.object({ plan: z.uuid().optional(), supplier: z.uuid().optional() })
    .safeParse(await searchParams);
  if (!query.success) notFound();
  const { plan, supplier } = query.data;
  const workspace = await loadPurchasingWorkspace(plan);
  const { selected, canWrite, locale } = workspace;
  const selectedSupplier = supplier
    ? workspace.suppliers.find((item) => item.id === supplier) : undefined;
  if ((plan && !selected) || (supplier && !selectedSupplier)) notFound();
  const es = locale === 'es';
  const suppliers = workspace.suppliers.filter((item) => !supplier || item.id === supplier);
  const packs = workspace.packs.filter((item) => !supplier || item.supplier_id === supplier);
  const suppliedIngredients = new Set(packs.filter((pack) => pack.active)
    .map((pack) => pack.ingredient_id));
  const plans = workspace.plans.filter((saved) => !supplier
    || saved.requirements.some((requirement) => suppliedIngredients.has(requirement.ingredient_id))
    || workspace.drafts.some((draft) => draft.supplier_id === supplier
      && draft.material_plan_id === saved.id));
  if (plan && supplier && !plans.some((saved) => saved.id === plan)) notFound();
  const requirements = workspace.requirements.filter((requirement) => !supplier
    || suppliedIngredients.has(requirement.ingredient_id));
  const planLabel = (id: string) => {
    const order = workspace.orders.find((item) => item.id === id);
    return order ? customerOrderLabel(order)
      : `${es ? 'Estimación anterior' : 'Earlier estimate'} · ${workspace.plans.find((item) => item.id === id)?.name ?? ''}`;
  };
  const drafts = workspace.drafts
    .filter((draft) => (!plan || draft.material_plan_id === plan)
      && (!supplier || draft.supplier_id === supplier))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const supplierBack = es ? 'Volver a proveedores' : 'Back to suppliers';
  const ordersBack = es ? 'Pedidos de clientes' : 'Customer orders';
  let description = es
    ? 'Revisa presentaciones, guarda borradores y registra pedidos confirmados con proveedores.'
    : 'Review supplier packs, save purchase drafts and record orders confirmed with suppliers.';
  if (selectedSupplier) description = `${es ? 'Pedidos de compra para' : 'Purchase orders for'} ${selectedSupplier.name}`;
  const inactiveSupplier = selectedSupplier && !selectedSupplier.active;
  const hasShortages = requirements.some((requirement) => requirement.shortage > 0);
  let noShortages = es ? 'No hay faltantes para este pedido.' : 'No shortages for this order.';
  if (supplier) noShortages = es ? 'No hay faltantes para este proveedor en el pedido.' : 'No shortages for this supplier on this order.';
  return (
    <>
      <PageHeader
        eyebrow={es ? 'DEL FALTANTE A LA ENTREGA' : 'FROM SHORTAGE TO DELIVERY'}
        title={es ? 'Compras' : 'Purchasing'}
        description={description}
        action={(
          <Link className="button" href={supplier ? '/app/suppliers' : '/app/orders'}>
            {supplier ? supplierBack : ordersBack}
          </Link>
        )}
      />
      {selectedSupplier && (
        <p className="notice">
          {`${es ? 'Proveedor seleccionado' : 'Selected supplier'}: ${selectedSupplier.name} · `}
          <Link href="/app/purchasing">{es ? 'Ver todas las compras' : 'View all purchasing'}</Link>
        </p>
      )}
      <section className="panel">
        <h2>{es ? 'Seleccionar pedido de cliente' : 'Choose a customer order'}</h2>
        <div className="worksheet-links">
          {plans.filter((saved) => saved.status === 'Active').map((saved) => (
            <Link
              className="worksheet-link"
              href={`/app/purchasing?plan=${saved.id}${supplier ? `&supplier=${supplier}` : ''}`}
              key={saved.id}
              aria-current={selected?.id === saved.id ? 'page' : undefined}
            >
              {planLabel(saved.id)}
              <small>{`${es ? 'Cliente necesita para' : 'Customer needs by'}: ${formatDate(saved.needed_on)}`}</small>
            </Link>
          ))}
        </div>
        {!plans.some((saved) => saved.status === 'Active') && (
          <p>
            {es
              ? 'No hay pedidos activos relacionados. Registra un pedido de cliente y configura las presentaciones del proveedor en sus ingredientes.'
              : 'No matching active orders. Enter a customer order and configure this supplier’s packs on the ingredients.'}
          </p>
        )}
      </section>
      {selected?.status === 'Active' && (
        <section className="panel">
          <h2>{planLabel(selected.id)}</h2>
          <p>
            {es
              ? 'Solo los pedidos confirmados cuentan como entrada. Los borradores no cambian el inventario.'
              : 'Only confirmed orders count as inbound supply. Drafts do not change inventory.'}
          </p>
          {inactiveSupplier && (
            <p className="notice">{es ? 'Proveedor inactivo: solo historial.' : 'Inactive supplier: order history only.'}</p>
          )}
          {!inactiveSupplier && !hasShortages && <p className="notice">{noShortages}</p>}
          {!inactiveSupplier && hasShortages && canWrite && (
            <PurchaseComposer
              key={`${selected.id}-${supplier ?? 'all'}-${JSON.stringify(requirements)}`}
              planId={selected.id}
              neededOn={selected.needed_on}
              requirements={requirements}
              packs={packs}
              suppliers={suppliers}
              existingSuppliers={drafts.filter((draft) => draft.status === 'Draft').map((draft) => draft.supplier_id)}
              locale={locale}
            />
          )}
        </section>
      )}
      <section className="panel">
        <h2>{es ? 'Borradores y pedidos registrados' : 'Purchase drafts & recorded orders'}</h2>
        {!drafts.length && <p className="empty">{es ? 'Aún no hay compras guardadas.' : 'No saved purchases yet.'}</p>}
        {drafts.map((draft) => (
          <PurchaseOrderCard
            key={draft.id}
            draft={draft}
            lines={workspace.lines}
            receipts={workspace.receipts}
            supplierName={workspace.suppliers.find((item) => item.id === draft.supplier_id)?.name ?? (es ? 'Proveedor no disponible' : 'Supplier unavailable')}
            orderLabel={planLabel(draft.material_plan_id)}
            neededOn={workspace.plans.find((saved) => saved.id === draft.material_plan_id)
              ?.needed_on}
            canWrite={canWrite}
            locale={locale}
          />
        ))}
      </section>
    </>
  );
}
