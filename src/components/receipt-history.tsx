import Link from 'next/link';
import { date, number } from '@/lib/data';
import type {
  Receipt, ReceiptLine, Ingredient, Supplier,
} from '@/domain/master-data';
import type { PurchaseDraft, PurchaseLine } from '@/domain/purchasing';

export default function ReceiptHistory({
  receipts,
  lines,
  ingredients,
  suppliers,
  purchaseDrafts = [],
  purchaseLines = [],
  serializedReceiptLineIds = [],
  locale = 'en',
}: {
  receipts: Receipt[];
  lines: ReceiptLine[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  purchaseDrafts?: PurchaseDraft[];
  purchaseLines?: PurchaseLine[];
  serializedReceiptLineIds?: string[];
  locale?: 'en' | 'es';
}) {
  const es = locale === 'es';
  const ingredientNames = new Map(ingredients.map((i) => [i.id, i.name]));
  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
  const purchaseLineMap = new Map(purchaseLines.map((line) => [line.id, line]));
  const purchaseDraftMap = new Map(purchaseDrafts.map((draft) => [draft.id, draft]));
  function sourceLotOriginLabel(origin: ReceiptLine['source_lot_origin']) {
    if (origin === null) return '';
    if (origin === 'supplier_provided') {
      return es ? ' · Proporcionado por el proveedor' : ' · Supplier-provided';
    }
    return es ? ' · Asignado por Salad Soulmates' : ' · Salad Soulmates-assigned';
  }
  const recent = [...receipts].sort((left, right) => (
    right.received_on.localeCompare(left.received_on)
      || right.created_at.localeCompare(left.created_at)
  ));
  return (
    <section className="panel" id="receipt-history">
      <h2>{es ? 'Historial de recepciones' : 'Receipt history'}</h2>
      {recent.length ? recent.map((receipt) => {
        const receiptLines = lines.filter((line) => line.receipt_id === receipt.id);
        const hasLabels = receiptLines.some((line) => serializedReceiptLineIds.includes(line.id));
        return (
          <article className="purchase-group" id={`receipt-${receipt.id}`} key={receipt.id}>
            <div className="section-heading">
              <h3>{`${date(receipt.received_on)} · ${supplierNames.get(receipt.supplier_id) ?? '—'}`}</h3>
              {hasLabels ? (
                <Link href={`/receiving/labels?receipt=${receipt.id}`}>
                  {es ? 'Etiquetas' : 'Labels'}
                </Link>
              ) : (
                <span className="badge muted">{es ? 'Etiquetas pendientes' : 'Labels pending'}</span>
              )}
            </div>
            <p>
              <strong>{receipt.supplier_reference || (es ? 'Sin referencia de entrega' : 'No delivery reference')}</strong>
            </p>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>{es ? 'Pedido de compra' : 'Purchase order'}</th>
                    <th>{es ? 'Ingrediente' : 'Ingredient'}</th>
                    <th>{es ? 'Cantidad' : 'Quantity'}</th>
                    <th>{es ? 'Lote de origen / vencimiento' : 'Source lot / expiration'}</th>
                  </tr>
                </thead>
                <tbody>
                  {receiptLines.map((line) => {
                    const purchaseLine = line.purchase_draft_line_id
                      ? purchaseLineMap.get(line.purchase_draft_line_id)
                      : undefined;
                    const purchase = purchaseLine
                      ? purchaseDraftMap.get(purchaseLine.purchase_draft_id)
                      : undefined;
                    const sourceLotLabel = sourceLotOriginLabel(line.source_lot_origin);
                    return (
                      <tr key={line.id}>
                        <td>{purchase?.reference || (purchase ? purchase.id.slice(0, 8) : '—')}</td>
                        <td>{ingredientNames.get(line.ingredient_id) ?? '—'}</td>
                        <td>{`${number(Number(line.quantity))} ${line.uom}`}</td>
                        <td>
                          {line.source_lot_origin === 'supplier_provided'
                            ? line.supplier_lot
                            : line.assigned_source_lot || '—'}
                          {sourceLotLabel}
                          {line.expiration_date ? ` · ${date(line.expiration_date)}` : ''}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </article>
        );
      }) : (
        <div className="empty">
          <h3>{es ? 'Aún no hay recepciones' : 'No receipts yet'}</h3>
          <p>
            {es
              ? 'La primera entrega registrada aparecerá aquí.'
              : 'The first posted supplier delivery will appear here.'}
          </p>
        </div>
      )}
    </section>
  );
}
