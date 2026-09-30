import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Suspense } from 'react';
import { z } from 'zod';
import DirectoryToolbar from '@/components/directory-toolbar';
import loadPurchasingWorkspace from '@/lib/purchasing-data';
import { PageHeader } from '@/components/shell';
import PurchaseComposer from '@/components/purchase-composer';
import PurchaseOrderCard from '@/components/purchase-order-card';
import StandalonePurchaseComposer from '@/components/standalone-purchase-composer';
import { formatDate, formatNumber } from '@/domain/format';
import ListGrid from '@/components/list-grid';
import { customerOrderLabel } from '@/domain/customer-orders';
import {
  PURCHASING_PAGE_SIZE, parsePurchasingDirectoryQuery, purchasingDirectorySorts,
  selectPurchaseDrafts, type PurchasingSearchParams,
} from './directory-query';

export default async function Purchasing({
  searchParams,
}: {
  searchParams: Promise<PurchasingSearchParams>;
}) {
  const rawQuery = await searchParams;
  const query = z.object({
    plan: z.uuid().optional(),
    supplier: z.uuid().optional(),
    ingredient: z.uuid().optional(),
  })
    .safeParse(rawQuery);
  if (!query.success) notFound();
  const { plan, supplier, ingredient } = query.data;
  if (plan && ingredient) notFound();
  const workspace = await loadPurchasingWorkspace(plan);
  const { selected, canWrite, locale } = workspace;
  const selectedSupplier = supplier
    ? workspace.suppliers.find((item) => item.id === supplier) : undefined;
  const selectedIngredient = ingredient
    ? workspace.ingredients.find((item) => item.id === ingredient && item.active) : undefined;
  if ((plan && !selected) || (supplier && !selectedSupplier)
    || (ingredient && !selectedIngredient)) notFound();
  const es = locale === 'es';
  const packs = workspace.packs.filter((item) => (!supplier || item.supplier_id === supplier)
    && (!ingredient || item.ingredient_id === ingredient));
  const suppliers = workspace.suppliers.filter((item) => (!supplier || item.id === supplier)
    && (!ingredient || (item.active
      && packs.some((pack) => pack.active && pack.supplier_id === item.id))));
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
  const scopedDrafts = workspace.drafts
    .filter((draft) => (!plan || draft.material_plan_id === plan)
      && (!supplier || draft.supplier_id === supplier)
      && (!ingredient || workspace.lines.some((line) => line.purchase_draft_id === draft.id
        && line.ingredient_id === ingredient)));
  const scopedDraftIds = new Set(scopedDrafts.map((draft) => draft.id));
  const scopedLines = workspace.lines.filter((line) => scopedDraftIds.has(line.purchase_draft_id));
  const supplierNames = new Map(workspace.suppliers.map((item) => [item.id, item.name]));
  const orderNames = new Map(workspace.plans.map((item) => [item.id, planLabel(item.id)]));
  const ingredientNames = new Map(workspace.ingredients.map((item) => [item.id, item.name]));
  const directoryQuery = parsePurchasingDirectoryQuery(
    rawQuery,
    [...new Set(scopedDrafts.map((draft) => draft.supplier_id))],
    [...new Set(scopedDrafts.flatMap((draft) => (
      draft.material_plan_id ? [draft.material_plan_id] : []
    )))],
    [...new Set(scopedLines.map((line) => line.ingredient_id))],
    [...new Set(scopedDrafts.map((draft) => draft.expected_on))],
  );
  const drafts = selectPurchaseDrafts(
    scopedDrafts,
    scopedLines,
    workspace.receipts,
    directoryQuery,
    supplierNames,
    orderNames,
    ingredientNames,
    locale,
  );
  const pageCount = Math.max(1, Math.ceil(drafts.length / PURCHASING_PAGE_SIZE));
  const visibleDrafts = drafts.slice(
    (directoryQuery.page - 1) * PURCHASING_PAGE_SIZE,
    directoryQuery.page * PURCHASING_PAGE_SIZE,
  );
  const toolbarFilters = [
    { key: 'supplierFilter', label: es ? 'Proveedor' : 'Supplier', options: [...new Set(scopedDrafts.map((draft) => draft.supplier_id))].map((id) => ({ value: id, label: supplierNames.get(id) ?? id })) },
    {
      key: 'status',
      label: es ? 'Estado' : 'Status',
      options: [
        { value: 'Draft', label: es ? 'Borrador' : 'Draft' },
        { value: 'Confirmed', label: es ? 'Confirmado' : 'Confirmed' },
        { value: 'Cancelled', label: es ? 'Cancelado' : 'Cancelled' },
      ],
    },
    { key: 'delivery', label: es ? 'Entrega' : 'Delivery', options: [{ value: 'unreceived', label: es ? 'Pendiente de recibir' : 'Awaiting receipt' }] },
    { key: 'orderFilter', label: es ? 'Pedido de cliente' : 'Customer order', options: [...new Set(scopedDrafts.flatMap((draft) => (draft.material_plan_id ? [draft.material_plan_id] : [])))].map((id) => ({ value: id, label: orderNames.get(id) ?? id })) },
    { key: 'ingredientFilter', label: es ? 'Ingrediente' : 'Ingredient', options: [...new Set(scopedLines.map((line) => line.ingredient_id))].map((id) => ({ value: id, label: ingredientNames.get(id) ?? id })) },
    { key: 'due', label: es ? 'Fecha esperada' : 'Expected date', options: [...new Set(scopedDrafts.map((draft) => draft.expected_on))].sort().map((date) => ({ value: date, label: formatDate(date) })) },
  ];
  const sortOptions = purchasingDirectorySorts.map((option) => ({
    ...option,
    label: es ? ({ recent: 'Guardados recientemente', 'due-soon': 'Fecha más próxima', 'due-late': 'Fecha más lejana' })[option.value] : option.label,
  }));
  const supplierBack = es ? 'Volver a proveedores' : 'Back to suppliers';
  const inventoryBack = es ? 'Volver al inventario' : 'Back to inventory';
  const ordersBack = es ? 'Pedidos de clientes' : 'Customer orders';
  let description = es
    ? 'Revisa presentaciones, guarda borradores y registra pedidos confirmados con proveedores.'
    : 'Review supplier packs, save purchase drafts and record orders confirmed with suppliers.';
  if (selectedSupplier) description = `${es ? 'Pedidos de compra para' : 'Purchase orders for'} ${selectedSupplier.name}`;
  if (selectedIngredient) description = `${es ? 'Comprar' : 'Purchase'} ${selectedIngredient.name}`;
  let backHref = '/app/orders';
  let backLabel = ordersBack;
  if (supplier) {
    backHref = '/app/suppliers';
    backLabel = supplierBack;
  }
  if (ingredient) {
    backHref = '/app/inventory';
    backLabel = inventoryBack;
  }
  let standaloneTitle = es ? 'Compra independiente' : 'Standalone supplier purchase';
  let standaloneDescription = es
    ? 'Crea una orden de compra para reabastecer ingredientes sin un pedido de cliente activo.'
    : 'Create a purchase order to replenish ingredients without an active customer order.';
  if (selectedIngredient) {
    standaloneTitle = `${es ? 'Selecciona un proveedor para' : 'Select a supplier for'} ${selectedIngredient.name}`;
    standaloneDescription = es
      ? 'El ingrediente está fijo. Elige un proveedor y la cantidad de presentaciones completas.'
      : 'The ingredient is fixed. Choose a supplier and enter the number of whole packs.';
  }
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
          <Link className="button" href={backHref}>
            {backLabel}
          </Link>
        )}
      />
      {selectedSupplier && (
        <p className="notice">
          {`${es ? 'Proveedor seleccionado' : 'Selected supplier'}: ${selectedSupplier.name} · `}
          <Link href="/app/purchasing">{es ? 'Ver todas las compras' : 'View all purchasing'}</Link>
        </p>
      )}
      {selectedIngredient && (
        <p className="notice">
          {`${es ? 'Ingrediente seleccionado' : 'Selected ingredient'}: ${selectedIngredient.name}`}
        </p>
      )}
      {!ingredient && (
        <section className="panel">
          <h2>{es ? 'Pedido de cliente (opcional)' : 'Customer order (optional)'}</h2>
          <div className="worksheet-links">
            {plans.filter((saved) => saved.status === 'Active').map((saved) => (
              <Link
                className="worksheet-link"
                href={`/app/purchasing?plan=${saved.id}${supplier ? `&supplier=${supplier}` : ''}`}
                key={saved.id}
                aria-current={selected?.id === saved.id ? 'page' : undefined}
              >
                {planLabel(saved.id)}
                <small>{`${es ? 'Fecha de recogida del cliente' : 'Customer pickup date'}: ${formatDate(saved.needed_on)}`}</small>
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
      )}
      {(supplier || ingredient) && !inactiveSupplier && canWrite && !selected && (
        <section className="panel">
          <h2>
            {standaloneTitle}
          </h2>
          <p>
            {standaloneDescription}
          </p>
          {selectedIngredient && !suppliers.length && (
            <p className="notice">
              {es
                ? 'Este ingrediente no tiene presentaciones activas de proveedores. Configúralas en los detalles del ingrediente.'
                : 'This ingredient has no active supplier packs. Configure one in the ingredient details.'}
            </p>
          )}
          <StandalonePurchaseComposer
            suppliers={suppliers}
            packs={packs}
            ingredients={(workspace.ingredients ?? []).filter((item) => item.active
              && (!ingredient || item.id === ingredient))}
            supplierPrices={workspace.supplierPrices}
            locale={locale}
          />
        </section>
      )}
      {selected?.status === 'Active' && (
        <section className="panel">
          <h2>{planLabel(selected.id)}</h2>
          <p>
            {es
              ? 'Solo los pedidos confirmados cuentan como entrada. Los borradores no cambian el inventario.'
              : 'Only confirmed orders count as inbound supply. Drafts do not change inventory.'}
          </p>
          <ListGrid
            label={es ? 'Demanda y brecha de compra' : 'Demand and purchase gap'}
            locale={locale}
            columns={[
              { key: 'ingredient', label: es ? 'Ingrediente' : 'Ingredient' },
              { key: 'required', label: es ? 'Demanda' : 'Order demand' },
              { key: 'onHand', label: es ? 'Existencias' : 'Stock on hand' },
              { key: 'inbound', label: es ? 'Entradas confirmadas' : 'Confirmed inbound' },
              { key: 'shortage', label: es ? 'Brecha de compra' : 'Purchase gap' },
            ]}
            rows={requirements.map((requirement) => ({
              id: requirement.ingredient_id,
              cells: {
                ingredient: { text: requirement.ingredient_name },
                required: { text: `${formatNumber(requirement.required)} ${requirement.uom}`, sortValue: requirement.required },
                onHand: { text: `${formatNumber(requirement.on_hand)} ${requirement.uom}`, sortValue: requirement.on_hand },
                inbound: { text: `${formatNumber(requirement.confirmed_inbound)} ${requirement.uom}`, sortValue: requirement.confirmed_inbound },
                shortage: { text: `${formatNumber(requirement.shortage)} ${requirement.uom}`, sortValue: requirement.shortage },
              },
            }))}
          />
          {inactiveSupplier && (
            <p className="notice">{es ? 'Proveedor inactivo: solo historial.' : 'Inactive supplier: order history only.'}</p>
          )}
          {!inactiveSupplier && !hasShortages && <p className="notice">{noShortages}</p>}
          {!inactiveSupplier && hasShortages && canWrite && (
            <PurchaseComposer
              key={`${selected.id}-${supplier ?? 'all'}-${JSON.stringify(requirements)}`}
              planId={selected.id}
              neededOn={workspace.production?.status !== 'Cancelled'
                ? workspace.production?.start_on ?? selected.needed_on : selected.needed_on}
              requirements={requirements}
              packs={packs}
              suppliers={suppliers}
              existingSuppliers={scopedDrafts.filter((draft) => draft.status === 'Draft').map((draft) => draft.supplier_id)}
              supplierPrices={workspace.supplierPrices}
              locale={locale}
            />
          )}
        </section>
      )}
      <section className="panel">
        <h2>{es ? 'Borradores y pedidos registrados' : 'Purchase drafts & recorded orders'}</h2>
        <Suspense fallback={null}>
          <DirectoryToolbar label={es ? 'Buscar compras guardadas' : 'Search saved purchases'} resultCount={drafts.length} filters={toolbarFilters} sortOptions={sortOptions} locale={locale} pageCount={pageCount} mobileFilters />
        </Suspense>
        {!scopedDrafts.length && <p className="empty">{es ? 'Aún no hay compras guardadas. Selecciona un pedido o proveedor para comenzar.' : 'No saved purchases yet. Select an order or supplier to begin.'}</p>}
        {scopedDrafts.length > 0 && !visibleDrafts.length && <p className="empty">{es ? 'No hay compras en esta vista. Cambia o borra los filtros.' : 'No purchases in this view. Change or clear the filters.'}</p>}
        {visibleDrafts.map((draft) => (
          <PurchaseOrderCard
            key={draft.id}
            draft={draft}
            lines={workspace.lines}
            receipts={workspace.receipts}
            supplierName={workspace.suppliers.find((item) => item.id === draft.supplier_id)?.name ?? (es ? 'Proveedor no disponible' : 'Supplier unavailable')}
            orderLabel={draft.material_plan_id ? planLabel(draft.material_plan_id) : undefined}
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
