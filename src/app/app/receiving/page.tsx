import PendingSerialization from '@/components/pending-serialization';
import { serializationRowSchema } from '@/domain/receiving';
import SerializedInventory from '@/components/serialized-inventory';
import { outstandingInbound } from '@/domain/purchasing';
import hasPermission from '@/lib/permissions';
import { rowSchemas } from '@/domain/master-data';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import ReceiptForm from '@/components/receipt-form';
import ReceiptHistory from '@/components/receipt-history';
import PurchaseReceiving from '@/components/purchase-receiving';
import loadPurchaseReceivingData from '@/lib/purchase-receiving-data';

export default async function Receiving() {
  const { db, profile } = await requireAdminShell();
  const [ingredients, receipts, packs, serializations, purchasing, canReceive] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'inventory_receipts', rowSchemas.inventory_receipts),
    rows(db, 'supplier_items', rowSchemas.supplier_items),
    rows(db, 'receipt_serializations', serializationRowSchema),
    loadPurchaseReceivingData(db),
    hasPermission(db, 'inventory.receive'),
  ]);
  const {
    drafts: purchaseDrafts,
    orders,
    purchaseLines,
    receiptLines: lines,
    suppliers,
  } = purchasing;
  const serializedLines = new Set(serializations.map((entry) => entry.receipt_line_id));
  const es = profile.preferred_locale === 'es';
  return (
    <>
      <PageHeader
        eyebrow={es ? 'INVENTARIO ENTRANTE' : 'INBOUND INVENTORY'}
        title={es ? 'Recibir inventario' : 'Receive Inventory'}
        description={
          es
            ? 'Registra cada entrega con su proveedor y fecha. La cantidad recibida actualiza el inventario automáticamente.'
            : 'Record each delivery with its supplier and date. Posted quantities update inventory automatically.'
        }
      />
      <PurchaseReceiving
        orders={orders}
        canReceive={canReceive}
        locale={profile.preferred_locale}
        recoveryScope={`${profile.id}:${profile.facility_id}`}
      />
      {canReceive && (
        <details className="panel">
          <summary>{es ? 'Recibir sin pedido de compra' : 'Receive without a purchase order'}</summary>
          <ReceiptForm
            packs={packs}
            inbound={outstandingInbound(purchaseDrafts, purchaseLines, lines)}
            ingredients={ingredients.filter((i) => i.active)}
            suppliers={suppliers.filter((s) => s.active)}
            locale={profile.preferred_locale}
          />
        </details>
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
        purchaseDrafts={purchaseDrafts}
        purchaseLines={purchaseLines}
        serializedReceiptLineIds={serializations.map((entry) => entry.receipt_line_id)}
        locale={profile.preferred_locale}
      />
    </>
  );
}
