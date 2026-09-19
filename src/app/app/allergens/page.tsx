import { rowSchemas } from '@/domain/master-data';
import Link from 'next/link';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { RecordForm } from '@/components/record-form';
import { PageHeader } from '@/components/shell';

export default async function Allergens() {
  const { db, profile } = await requireAdminShell();
  const allergens = await rows(db, 'allergens', rowSchemas.allergens);
  return (
    <>
      <Link href="/app/ingredients" className="back-link">
        ← Ingredients
      </Link>
      <PageHeader
        eyebrow="INGREDIENT REFERENCE"
        title="Allergens"
        description="Add the reviewed allergen names you need, then assign them to ingredients. An empty list does not mean allergen-free."
      />
      <section className="panel">
        {allergens.length ? (
          <ul className="tags">
            {allergens.map((a) => (
              <li key={a.id}>{a.name}</li>
            ))}
          </ul>
        ) : (
          <p>No allergens recorded yet.</p>
        )}
        {profile.role === 'admin' && (
          <RecordForm
            kind="allergen"
            fields={[{ name: 'name', label: 'Allergen name', required: true }]}
            submit="Add allergen"
          />
        )}
      </section>
    </>
  );
}
