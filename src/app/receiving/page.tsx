import { redirect } from 'next/navigation';
import { requireProfile } from '@/lib/auth';
import { rows } from '@/lib/data';
import { ReceiptForm } from '@/components/receipt-form';
import { ReceiptHistory } from '@/components/receipt-history';
import { FeedbackDrawer } from '@/components/feedback';
import type { Ingredient, Supplier, Receipt, ReceiptLine } from '@/domain/master-data';

export default async function ReceiverWorkspace() {
  const { db, profile } = await requireProfile();
  if (profile.role === 'worker') redirect('/worker');
  if (profile.role === 'reviewer') redirect('/app/receiving');
  const [ingredients, suppliers, receipts, lines] = await Promise.all([
    rows<Ingredient>(db, 'ingredients'),
    rows<Supplier>(db, 'suppliers'),
    rows<Receipt>(db, 'inventory_receipts'),
    rows<ReceiptLine>(db, 'inventory_receipt_lines'),
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
