import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import loadPurchasingWorkspace from '@/lib/purchasing-data';
import { PageHeader } from '@/components/shell';
import PurchaseComposer from '@/components/purchase-composer';
import PurchaseStatusForm from '@/components/purchase-status-form';
import { formatNumber, formatDate, QUANTITY_SCALE } from '@/domain/format';
import { customerOrderLabel } from '@/domain/customer-orders';
import { outstandingInbound } from '@/domain/purchasing';

export default async function Purchasing({
  searchParams,
}: {
  searchParams: Promise<{ plan?: string }>;
}) {
  const { plan } = await searchParams;
  if (plan && !z.uuid().safeParse(plan).success) notFound();
  const workspace = await loadPurchasingWorkspace(plan);
  const { receipts } = workspace;
  const {
    selected, requirements, canWrite, locale,
  } = workspace;
  if (plan && !selected) notFound();
  const es = locale === 'es';
  const planLabel = (id: string) => {
    const order = workspace.orders.find((item) => item.id === id);
    return order ? customerOrderLabel(order)
      : `${es ? 'Estimación anterior' : 'Earlier estimate'} · ${workspace.plans.find((item) => item.id === id)?.name ?? ''}`;
  };
  const drafts = workspace.drafts
    .filter((draft) => !plan || draft.material_plan_id === plan)
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  const inbound = outstandingInbound(workspace.drafts, workspace.lines, receipts);
  return (
    <>
      <PageHeader
        eyebrow={es ? 'DEL FALTANTE A LA ENTREGA' : 'FROM SHORTAGE TO DELIVERY'}
        title={es ? 'Compras' : 'Purchasing'}
        description={
          es
            ? 'Revisa presentaciones, guarda borradores y registra pedidos confirmados con proveedores.'
            : 'Review supplier packs, save purchase drafts and record orders confirmed with suppliers.'
        }
        action={(
          <Link className="button" href="/app/orders">
            {es ? 'Pedidos de clientes' : 'Customer orders'}
          </Link>
        )}
      />
      <section className="panel">
        <h2>{es ? 'Seleccionar pedido de cliente' : 'Choose a customer order'}</h2>
        <div className="worksheet-links">
          {workspace.plans
            .filter((saved) => saved.status === 'Active')
            .map((saved) => (
              <Link
                className="worksheet-link"
                href={`/app/purchasing?plan=${saved.id}`}
                key={saved.id}
                aria-current={selected?.id === saved.id ? 'page' : undefined}
              >
                {planLabel(saved.id)}
              </Link>
            ))}
        </div>
        {!workspace.plans.some((saved) => saved.status === 'Active') && (
          <p>
            {es
              ? 'Registra un pedido de cliente para calcular las compras.'
              : 'Enter a customer order to calculate purchasing needs.'}
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
          {!requirements.some((requirement) => requirement.shortage > 0) ? (
            <p className="notice">
              {es
                ? 'No hay faltantes para este pedido.'
                : 'No shortages for this order.'}
            </p>
          ) : (
            canWrite && (
              <PurchaseComposer
                key={`${selected.id}-${JSON.stringify(requirements)}`}
                planId={selected.id}
                neededOn={selected.needed_on}
                requirements={requirements}
                packs={workspace.packs}
                suppliers={workspace.suppliers}
                existingSuppliers={drafts
                  .filter((draft) => draft.status === 'Draft')
                  .map((draft) => draft.supplier_id)}
                locale={locale}
              />
            )
          )}
        </section>
      )}
      <section className="panel">
        <h2>
          {es ? 'Borradores y pedidos registrados' : 'Purchase drafts & recorded orders'}
        </h2>
        {!drafts.length && (
          <p className="empty">
            {es ? 'Aún no hay compras guardadas.' : 'No saved purchases yet.'}
          </p>
        )}
        {drafts.map((draft) => {
          const lines = workspace.lines.filter(
            (line) => line.purchase_draft_id === draft.id,
          );
          return (
            <article className="purchase-group" key={draft.id}>
              <div className="section-heading">
                <h3>
                  {
                    workspace.suppliers.find(
                      (supplier) => supplier.id === draft.supplier_id,
                    )?.name
                  }
                </h3>
                <span className="badge">{draft.status}</span>
              </div>
              <p>
                {es ? 'Previsto' : 'Expected'}
                :
                {formatDate(draft.expected_on)}
                {' '}
                ·
                {' '}
                {draft.reference || draft.id.slice(0, 8)}
              </p>
              <Link href={`/app/orders?estimate=${draft.material_plan_id}`}>
                {
                  planLabel(draft.material_plan_id)
                }
              </Link>
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">
                    {es ? 'Líneas de compra' : 'Purchase lines'}
                  </caption>
                  <thead>
                    <tr>
                      {(es
                        ? [
                          'Ingrediente',
                          'Presentación guardada',
                          'Pedido',
                          'Recibido',
                          'Pendiente',
                        ]
                        : [
                          'Ingredient',
                          'Saved pack',
                          'Ordered',
                          'Received',
                          'Outstanding',
                        ]
                      ).map((heading) => (
                        <th key={heading} scope="col">
                          {heading}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody>
                    {lines.map((line) => {
                      const received = receipts
                        .filter((receipt) => receipt.purchase_draft_line_id === line.id)
                        .reduce(
                          (sum, receipt) => sum + Math.round(receipt.quantity * QUANTITY_SCALE),
                          0,
                        ) / QUANTITY_SCALE;
                      return (
                        <tr key={line.id}>
                          <th scope="row">
                            {line.ingredient_name}
                            {line.override_reason && (
                              <small>
                                {' '}
                                ·
                                {line.override_reason}
                              </small>
                            )}
                          </th>
                          <td>
                            {formatNumber(line.pack_quantity)}
                            {' '}
                            {line.uom}
                            /
                            {line.purchase_uom}
                            <small>
                              {' '}
                              {line.supplier_sku}
                            </small>
                          </td>
                          <td>
                            {line.purchase_units}
                            {' '}
                            {line.purchase_uom}
                            {' '}
                            =
                            {' '}
                            {formatNumber(line.quantity)}
                            {' '}
                            {line.uom}
                          </td>
                          <td>
                            {formatNumber(received)}
                            {' '}
                            {line.uom}
                          </td>
                          <td>
                            {draft.status === 'Confirmed'
                              ? formatNumber(
                                inbound.find((choice) => choice.id === line.id)
                                  ?.remaining ?? 0,
                              )
                              : '—'}
                            {' '}
                            {line.uom}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
              {canWrite && (
                <details>
                  <summary>{es ? 'Actualizar estado' : 'Update status'}</summary>
                  <PurchaseStatusForm
                    key={`${draft.id}-${draft.revision}`}
                    draft={draft}
                    locale={locale}
                  />
                </details>
              )}
            </article>
          );
        })}
      </section>
    </>
  );
}
