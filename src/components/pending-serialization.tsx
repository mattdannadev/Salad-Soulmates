import type { ReceiptLine } from '@/domain/master-data';
import ReceivingSubmit from './receiving-submit';

export default function PendingSerialization({
  lines,
  ingredientNames,
}: {
  lines: ReceiptLine[];
  ingredientNames: Map<string, string>;
}) {
  if (!lines.length) return null;
  return (
    <section className="panel">
      <h2>Receipts awaiting package labels</h2>
      <p>
        Enter the actual physical packages for older receipts. This assigns identities without
        adding inventory again.
      </p>
      {lines.map((line) => (
        <details key={line.id} className="serial-history">
          <summary>
            {ingredientNames.get(line.ingredient_id) ?? 'Ingredient'}
            {' '}
            ·
            {line.quantity}
            {' '}
            {line.uom}
            {' '}
            ·
            Source lot
            {' '}
            {line.source_lot_origin === 'supplier_provided'
              ? line.supplier_lot
              : line.assigned_source_lot || 'Not recorded'}
          </summary>
          {line.source_lot_origin ? (
            <ReceivingSubmit
              operation="serialize"
              values={{ receipt_line_id: line.id }}
              submit="Serialize existing receipt"
            >
              <label htmlFor={`allocation-${line.id}`}>
                Quantity in each physical package (
                {line.uom}
                )
                <textarea
                  id={`allocation-${line.id}`}
                  name="package_lines"
                  required
                  maxLength={30000}
                />
              </label>
              <small>
                One quantity per line. Add | unique supplier barcode only if it identifies this
                physical package.
              </small>
            </ReceivingSubmit>
          ) : (
            <p className="error-notice">
              No source-lot evidence was recorded. This legacy receipt cannot be serialized until a
              controlled evidence-correction workflow exists; the original receipt remains
              unchanged.
            </p>
          )}
        </details>
      ))}
    </section>
  );
}
