import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import type { Supplier } from '@/domain/master-data';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';
export default async function Suppliers() {
  const { db, profile } = await requireAdminShell();
  const suppliers = (await rows<Supplier>(db, 'suppliers')).sort((a, b) =>
    a.name.localeCompare(b.name),
  );
  return (
    <>
      <PageHeader
        eyebrow="OUR PARTNERS"
        title="Suppliers"
        description="The people behind your ingredients. Keep contacts and lead times in one place."
      />
      <section className="panel">
        <h2>Your suppliers</h2>
        {!suppliers.length && (
          <div className="empty">
            <h3>Your next good partnership starts here</h3>
            <p>Add a supplier, then connect their packs from an ingredient’s detail page.</p>
          </div>
        )}
        {suppliers.map((s) => (
          <details key={s.id}>
            <summary>
              {s.name} <span className="badge">{s.active ? 'Active' : 'Inactive'}</span>
            </summary>
            {profile.role === 'admin' ? (
              <SupplierForm supplier={s} />
            ) : (
              <p>
                {s.contact_name} · {s.email || 'No email'} · {s.phone || 'No phone'} ·{' '}
                {s.lead_time_days ?? 0} days
              </p>
            )}
          </details>
        ))}
      </section>
      {profile.role === 'admin' && (
        <section className="panel">
          <h2>Add supplier</h2>
          <SupplierForm />
        </section>
      )}
    </>
  );
}
