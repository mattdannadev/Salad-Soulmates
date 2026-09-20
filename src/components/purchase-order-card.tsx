import Link from 'next/link';
import { formatDate, formatNumber } from '@/domain/format';
import type { PurchaseDraft, PurchaseLine } from '@/domain/purchasing';
import { purchaseProgress, purchaseStatusLabel, type PurchaseReceipt } from '@/domain/supplier-orders';
import PurchaseStatusForm from './purchase-status-form';

export default function PurchaseOrderCard({
  draft, lines, receipts, supplierName, orderLabel, neededOn = undefined, canWrite, locale,
}: {
  draft: PurchaseDraft;
  lines: PurchaseLine[];
  receipts: PurchaseReceipt[];
  supplierName: string;
  orderLabel: string;
  neededOn?: string;
  canWrite: boolean;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const progress = purchaseProgress(draft, lines, receipts);
  return (
    <article className="purchase-group" id={`purchase-${draft.id}`}>
      <div className="section-heading">
        <h3>{supplierName}</h3>
        <span className="badge">{purchaseStatusLabel(progress.status, locale)}</span>
      </div>
      <p><strong>{draft.reference || `${es ? 'Compra' : 'Purchase'} · ${draft.id.slice(0, 8)}`}</strong></p>
      <Link href={`/app/orders?estimate=${draft.material_plan_id}`}>{orderLabel}</Link>
      <dl className="purchase-dates">
        <div>
          <dt>{es ? 'Creado' : 'Created'}</dt>
          <dd>{formatDate(draft.created_at)}</dd>
        </div>
        <div>
          <dt>{es ? 'Entrega prevista' : 'Expected delivery'}</dt>
          <dd>{formatDate(draft.expected_on)}</dd>
        </div>
        {neededOn && (
        <div>
          <dt>{es ? 'Cliente necesita para' : 'Customer needs by'}</dt>
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
                ? ['Ingrediente', 'Presentación guardada', 'Pedido', 'Recibido', 'Pendiente']
                : ['Ingredient', 'Saved pack', 'Ordered', 'Received', 'Outstanding'])
                .map((heading) => <th key={heading} scope="col">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {progress.balances.map(({ line, received, remaining }) => (
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
                <td>{`${formatNumber(received)} ${line.uom}`}</td>
                <td>{draft.status === 'Cancelled' ? '—' : `${formatNumber(remaining)} ${line.uom}`}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {canWrite && !progress.hasReceipts && draft.status !== 'Cancelled' && (
        <details>
          <summary>{es ? 'Actualizar estado' : 'Update status'}</summary>
          <PurchaseStatusForm key={`${draft.id}-${draft.revision}`} draft={draft} locale={locale} />
        </details>
      )}
    </article>
  );
}
