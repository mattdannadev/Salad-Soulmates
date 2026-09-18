import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { IngredientForm } from '@/components/ingredient-form';
import { PageHeader } from '@/components/shell';
export default async function NewIngredient() {
  const { db, profile } = await requireAdminShell();
  if (profile.role !== 'admin') redirect('/app/ingredients');
  const allergens = await rows<{ id: string; name: string }>(db, 'allergens');
  return (
    <>
      <PageHeader
        eyebrow="INGREDIENTS"
        title="Add ingredient"
        description="Choose the unit you use to track inventory. Review the Spanish name before saving."
      />
      <section className="panel">
        <IngredientForm allergens={allergens} />
      </section>
    </>
  );
}
