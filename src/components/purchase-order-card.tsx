import Link from 'next/link';
import { formatDate, formatNumber } from '@/domain/format';
import {
  savedPurchaseCostTotal,
  type PurchaseDraft,
  type PurchaseLine,
} from '@/domain/purchasing';
import { purchaseProgress, purchaseStatusLabel, type PurchaseReceipt } from '@/domain/supplier-orders';
import PurchaseStatusForm from './purchase-status-form';

export default function PurchaseOrderCard({
  draft, lines, receipts, supplierName, orderLabel = undefined, neededOn = undefined, canWrite,
  locale,
}: {
  draft: PurchaseDraft;
  lines: PurchaseLine[];
  receipts: PurchaseReceipt[];
  supplierName: string;
  orderLabel?: string;
  neededOn?: string;
  canWrite: boolean;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const progress = purchaseProgress(draft, lines, receipts);
  const ownLines = lines.filter((line) => line.purchase_draft_id === draft.id);
  const estimate = savedPurchaseCostTotal(ownLines);
  const notRecorded = es ? 'No registrado' : 'Not recorded';
  const currency = (value: number) => new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', {
    style: 'currency', currency: 'USD',
  }).format(value);
  const totalCost = draft.total_cost === null ? notRecorded : currency(draft.total_cost);
  let estimatedTotal = estimate.total === null
    ? `Unavailable · ${estimate.missingPriceCount} missing price(s)`
    : currency(estimate.total);
  if (estimate.total === null && es) {
    estimatedTotal = `No disponible · faltan ${estimate.missingPriceCount} precio(s)`;
  }
  return (
    <article className="purchase-group" id={`purchase-${draft.id}`}>
      <div className="section-heading">
        <h3>{supplierName}</h3>
        <span className="badge">{purchaseStatusLabel(progress.status, locale)}</span>
      </div>
      <p><strong>{`${es ? 'N.º de pedido' : 'PO #'}: ${draft.reference || draft.id.slice(0, 8)}`}</strong></p>
      {draft.material_plan_id && orderLabel ? <Link href={`/app/orders?estimate=${draft.material_plan_id}`}>{orderLabel}</Link> : <p>{es ? 'Compra independiente de proveedor' : 'Standalone supplier purchase'}</p>}
      <dl className="purchase-dates">
        <div>
          <dt>{es ? 'Fecha de pedido' : 'Date placed'}</dt>
          <dd>{draft.placed_on ? formatDate(draft.placed_on) : notRecorded}</dd>
        </div>
        <div>
          <dt>{es ? 'Total cotizado por el proveedor' : 'Supplier quoted total'}</dt>
          <dd>
            {totalCost}
          </dd>
        </div>
        <div>
          <dt>{es ? 'Total estimado del borrador' : 'Estimated draft total'}</dt>
          <dd>
            {estimatedTotal}
          </dd>
        </div>
        <div>
          <dt>{es ? 'Entrega prevista' : 'Expected delivery'}</dt>
          <dd>{formatDate(draft.expected_on)}</dd>
        </div>
        {neededOn && (
        <div>
          <dt>{es ? 'Fecha de recogida del cliente' : 'Customer pickup date'}</dt>
          <dd>{formatDate(neededOn)}</dd>
        </div>
        )}
      </dl>
      <div className="table-wrap">
        <table>
          <caption className="sr-only">{es ? 'Líneas de compra' : 'Purchase lines'}</caption>
          <thead>
            <tr>
              {(es
                ? ['Ingrediente', 'Presentación guardada', 'Pedido', 'Costo unitario estimado', 'Costo de línea estimado', 'Recibido', 'Pendiente']
                : ['Ingredient', 'Saved pack', 'Ordered', 'Estimated unit cost', 'Estimated line cost', 'Received', 'Outstanding'])
                .map((heading) => <th key={heading} scope="col">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {progress.balances.map(({ line, received, remaining }) => {
              let unitCost = es ? 'Precio faltante' : 'Missing price';
              if (line.estimated_unit_cost != null) unitCost = currency(line.estimated_unit_cost);
              return (
                <tr key={line.id}>
                  <th scope="row">
                    {line.ingredient_name}
                    {line.override_reason && <small>{` · ${line.override_reason}`}</small>}
                  </th>
                  <td>
                    {`${formatNumber(line.pack_quantity)} ${line.uom}/${line.purchase_uom}`}
                    <small>{` ${line.supplier_sku}`}</small>
                  </td>
                  <td>{`${line.purchase_units} ${line.purchase_uom} = ${formatNumber(line.quantity)} ${line.uom}`}</td>
                  <td>{unitCost}</td>
                  <td>{line.estimated_line_cost == null ? '—' : currency(line.estimated_line_cost)}</td>
                  <td>{`${formatNumber(received)} ${line.uom}`}</td>
                  <td>{draft.status === 'Cancelled' ? '—' : `${formatNumber(remaining)} ${line.uom}`}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <small>
        {es
          ? 'La estimación usa el precio guardado al crear la compra; el total cotizado por el proveedor es el monto confirmado.'
          : 'The estimate uses the price snapshot saved when the purchase was created; the supplier-quoted total is the confirmed amount.'}
      </small>
      {canWrite && !progress.hasReceipts && draft.status !== 'Cancelled' && (
        <details>
          <summary>{es ? 'Actualizar estado' : 'Update status'}</summary>
          <PurchaseStatusForm key={`${draft.id}-${draft.revision}`} draft={draft} locale={locale} />
        </details>
      )}
    </article>
  );
}
