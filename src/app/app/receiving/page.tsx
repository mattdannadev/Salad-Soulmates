import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import { ReceiptForm } from '@/components/receipt-form';
import { ReceiptHistory } from '@/components/receipt-history';
import type { Ingredient, Supplier, Receipt, ReceiptLine } from '@/domain/master-data';

export default async function Receiving() {
  const { db, profile } = await requireAdminShell();
  const [ingredients, suppliers, receipts, lines] = await Promise.all([
    rows<Ingredient>(db, 'ingredients'),
    rows<Supplier>(db, 'suppliers'),
    rows<Receipt>(db, 'inventory_receipts'),
    rows<ReceiptLine>(db, 'inventory_receipt_lines'),
  ]);
  const es = profile.preferred_locale === 'es';
  const { data: canReceive } = await db.rpc('has_permission', { requested: 'inventory.receive' });
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
            ingredients={ingredients.filter((i) => i.active)}
            suppliers={suppliers.filter((s) => s.active)}
            locale={profile.preferred_locale}
          />
        </section>
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
