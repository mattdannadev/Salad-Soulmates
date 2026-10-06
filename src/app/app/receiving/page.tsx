import PendingSerialization from '@/components/pending-serialization';
import Link from 'next/link';
import CreationDialog from '@/components/creation-dialog';
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

export default async function Receiving({ searchParams }: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const rawQuery = await searchParams;
  const receiptParams = new URLSearchParams();
  Object.entries(rawQuery).forEach(([key, value]) => {
    if (typeof value === 'string' && key !== 'create') receiptParams.set(key, value);
  });
  const closeReceiptHref = `/app/receiving${receiptParams.size ? `?${receiptParams}` : ''}`;
  receiptParams.set('create', '1');
  const newReceiptHref = `/app/receiving?${receiptParams}`;
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
        action={canReceive ? (
          <Link className="button button--compact" href={newReceiptHref} scroll={false}>
            {es ? 'Recibir sin pedido de compra' : 'Receive without a purchase order'}
          </Link>
        ) : undefined}
      />
      <PurchaseReceiving
        orders={orders}
        canReceive={canReceive}
        locale={profile.preferred_locale}
        recoveryScope={`${profile.id}:${profile.facility_id}`}
      />
      {canReceive && (
        <CreationDialog
          open={rawQuery.create === '1'}
          title={es ? 'Recibir sin pedido de compra' : 'Receive without a purchase order'}
          closeHref={closeReceiptHref}
          closeLabel={es ? 'Cerrar recepción' : 'Close receiving form'}
        >
          <ReceiptForm
            packs={packs}
            inbound={outstandingInbound(purchaseDrafts, purchaseLines, lines)}
            ingredients={ingredients.filter((i) => i.active)}
            suppliers={suppliers.filter((s) => s.active)}
            locale={profile.preferred_locale}
          />
        </CreationDialog>
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
