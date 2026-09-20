import PendingSerialization from '@/components/pending-serialization';
import { serializationRowSchema } from '@/domain/receiving';
import SerializedInventory from '@/components/serialized-inventory';
import {
  purchaseDraftRowSchema,
  purchaseLineRowSchema,
  outstandingInbound,
} from '@/domain/purchasing';
import hasPermission from '@/lib/permissions';
import { rowSchemas } from '@/domain/master-data';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import ReceiptForm from '@/components/receipt-form';
import ReceiptHistory from '@/components/receipt-history';

export default async function Receiving() {
  const { db, profile } = await requireAdminShell();
  const [
    ingredients, suppliers, receipts, lines, purchaseDrafts, purchaseLines, packs, serializations,
  ] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'suppliers', rowSchemas.suppliers),
    rows(db, 'inventory_receipts', rowSchemas.inventory_receipts),
    rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines),
    rows(db, 'purchase_drafts', purchaseDraftRowSchema),
    rows(db, 'purchase_draft_lines', purchaseLineRowSchema),
    rows(db, 'supplier_items', rowSchemas.supplier_items),
    rows(db, 'receipt_serializations', serializationRowSchema),
  ]);
  const serializedLines = new Set(serializations.map((entry) => entry.receipt_line_id));
  const es = profile.preferred_locale === 'es';
  const canReceive = await hasPermission(db, 'inventory.receive');
  return (
    <>
      <PageHeader
        eyebrow={es ? 'INVENTARIO ENTRANTE' : 'INBOUND INVENTORY'}
        title={es ? 'Recepción' : 'Receiving'}
        description={
          es
            ? 'Registra cada entrega con su proveedor y fecha. La cantidad recibida actualiza el inventario automáticamente.'
            : 'Record each delivery with its supplier and date. Posted quantities update inventory automatically.'
        }
      />
      {canReceive && (
        <section className="panel">
          <ReceiptForm
            packs={packs}
            inbound={outstandingInbound(purchaseDrafts, purchaseLines, lines)}
            ingredients={ingredients.filter((i) => i.active)}
            suppliers={suppliers.filter((s) => s.active)}
            locale={profile.preferred_locale}
          />
        </section>
      )}
      <SerializedInventory db={db} locale={profile.preferred_locale} />
      {canReceive && (
      <PendingSerialization
        lines={lines.filter((line) => !serializedLines.has(line.id))}
        ingredientNames={new Map(ingredients.map((ingredient) => [ingredient.id, ingredient.name]))}
      />
      )}
      <ReceiptHistory
        receipts={receipts}
        lines={lines}
        ingredients={ingredients}
        suppliers={suppliers}
        locale={profile.preferred_locale}
      />
    </>
  );
}
