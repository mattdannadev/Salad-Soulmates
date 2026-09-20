import {
  purchaseDraftRowSchema,
  purchaseLineRowSchema,
  outstandingInbound,
} from '@/domain/purchasing';
import { rowSchemas } from '@/domain/master-data';
import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { rows } from '@/lib/data';
import ReceiptForm from '@/components/receipt-form';
import ReceiptHistory from '@/components/receipt-history';
import FeedbackDrawer from '@/components/feedback';

export const dynamic = 'force-dynamic';

export default async function ReceiverWorkspace() {
  const { db, profile } = await requireProfile();
  if (profile.role === 'worker') redirect('/worker');
  if (profile.role === 'reviewer') redirect('/app/receiving');
  const [
    ingredients, suppliers, receipts, lines, purchaseDrafts, purchaseLines,
  ] = await Promise.all([
    rows(db, 'ingredients', rowSchemas.ingredients),
    rows(db, 'suppliers', rowSchemas.suppliers),
    rows(db, 'inventory_receipts', rowSchemas.inventory_receipts),
    rows(db, 'inventory_receipt_lines', rowSchemas.inventory_receipt_lines),
    rows(db, 'purchase_drafts', purchaseDraftRowSchema),
    rows(db, 'purchase_draft_lines', purchaseLineRowSchema),
  ]);
  const es = profile.preferred_locale === 'es';
  return (
    <main className="worker-page">
      <p className="eyebrow">SALAD SOULMATES</p>
      <h1>{es ? 'Recepción' : 'Receiving'}</h1>
      <p>
        {es
          ? 'Registra entregas de proveedores de forma sencilla.'
          : 'Post supplier deliveries from this focused workspace.'}
      </p>
      <section className="panel">
        <ReceiptForm
          inbound={outstandingInbound(purchaseDrafts, purchaseLines, lines)}
          ingredients={ingredients.filter((i) => i.active)}
          suppliers={suppliers.filter((s) => s.active)}
          locale={profile.preferred_locale}
        />
      </section>
      <ReceiptHistory
        receipts={receipts}
        lines={lines}
        ingredients={ingredients}
        suppliers={suppliers}
        locale={profile.preferred_locale}
      />
      <FeedbackDrawer worker={es} />
    </main>
  );
}
