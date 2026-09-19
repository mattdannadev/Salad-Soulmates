import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import { rows } from '@/lib/data';
import { IngredientForm } from '@/components/ingredient-form';
import { PageHeader } from '@/components/shell';
export default async function NewIngredient() {
  const { db, profile } = await requireAdminShell();
  const [{ data: canWrite }, allergens, categoryResult] = await Promise.all([
    db.rpc('has_permission', { requested: 'master_data.write' }),
    rows<{ id: string; name: string }>(db, 'allergens'),
    db
      .from('reference_options')
      .select('code,label_en,label_es')
      .eq('list_code', 'ingredient_category')
      .eq('active', true)
      .order('sort_order'),
  ]);
  if (!canWrite) redirect('/app/ingredients');
  if (categoryResult.error) throw new Error('Unable to load ingredient types.');
  const categories = categoryResult.data;
  return (
    <>
      <PageHeader
        eyebrow="INGREDIENTS"
        title="Add ingredient"
        description="Choose the unit you use to track inventory. Review the Spanish name before saving."
      />
      <section className="panel">
        <IngredientForm
          allergens={allergens}
          categories={categories}
          locale={profile.preferred_locale}
        />
      </section>
    </>
  );
}
