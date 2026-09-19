import { date, number } from '@/lib/data';
import type {
  Receipt, ReceiptLine, Ingredient, Supplier,
} from '@/domain/master-data';

export default function ReceiptHistory({
  receipts,
  lines,
  ingredients,
  suppliers,
  locale = 'en',
}: {
  receipts: Receipt[];
  lines: ReceiptLine[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  locale?: 'en' | 'es';
}) {
  const es = locale === 'es';
  const ingredientNames = new Map(ingredients.map((i) => [i.id, i.name]));
  const supplierNames = new Map(suppliers.map((s) => [s.id, s.name]));
  const receiptMap = new Map(receipts.map((r) => [r.id, r]));
  const recent = [...lines].sort((a, b) => (receiptMap.get(b.receipt_id)?.received_on ?? '').localeCompare(
    receiptMap.get(a.receipt_id)?.received_on ?? '',
  ));
  return (
    <section className="panel">
      <h2>{es ? 'Historial de recepciones' : 'Receipt history'}</h2>
      {recent.length ? (
        <div className="table-wrap">
          <table>
            <thead>
              <tr>
                <th>{es ? 'Fecha' : 'Received'}</th>
                <th>{es ? 'Proveedor' : 'Supplier'}</th>
                <th>{es ? 'Ingrediente' : 'Ingredient'}</th>
                <th>{es ? 'Cantidad' : 'Quantity'}</th>
                <th>{es ? 'Referencia' : 'Reference'}</th>
                <th>{es ? 'Lote / vencimiento' : 'Lot / expiration'}</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((line) => {
                const receipt = receiptMap.get(line.receipt_id);
                return (
                  <tr key={line.id}>
                    <td>{receipt ? date(receipt.received_on) : '—'}</td>
                    <td>{receipt ? supplierNames.get(receipt.supplier_id) : '—'}</td>
                    <td>{ingredientNames.get(line.ingredient_id) ?? '—'}</td>
                    <td>
                      {number(Number(line.quantity))}
                      {' '}
                      {line.uom}
                    </td>
                    <td>{receipt?.supplier_reference || '—'}</td>
                    <td>
                      {line.supplier_lot || '—'}
                      {line.expiration_date ? ` · ${date(line.expiration_date)}` : ''}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      ) : (
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
