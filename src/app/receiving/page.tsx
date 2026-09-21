import hasPermission from '@/lib/permissions';
import PendingSerialization from '@/components/pending-serialization';
import { serializationRowSchema } from '@/domain/receiving';
import SerializedInventory from '@/components/serialized-inventory';
import { outstandingInbound } from '@/domain/purchasing';
import { rowSchemas } from '@/domain/master-data';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { rows } from '@/lib/data';
import ReceiptForm from '@/components/receipt-form';
import ReceiptHistory from '@/components/receipt-history';
import FeedbackDrawer from '@/components/feedback';
import PurchaseReceiving from '@/components/purchase-receiving';
import loadPurchaseReceivingData from '@/lib/purchase-receiving-data';

export const dynamic = 'force-dynamic';

export default async function ReceiverWorkspace() {
  const { db, profile } = await requireProfile();
  if (profile.role === 'worker') redirect('/worker');
  if (profile.role === 'reviewer') redirect('/app/receiving');
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
    <main className="worker-page">
      <p className="eyebrow">SALAD SOULMATES</p>
      <h1>{es ? 'Recibir inventario' : 'Receive Inventory'}</h1>
      <p>
        {es
          ? 'Registra entregas de proveedores de forma sencilla.'
          : 'Post supplier deliveries from this focused workspace.'}
      </p>
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
      <FeedbackDrawer locale={profile.preferred_locale} />
    </main>
  );
}
