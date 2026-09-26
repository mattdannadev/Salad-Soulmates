import { rowSchemas } from '@/domain/master-data';
import { redirect } from 'next/navigation';
import hasPermission from '@/lib/permissions';
import { requireAdminShell } from '@/lib/auth';
import { rows, readResult } from '@/lib/data';
import IngredientForm from '@/components/ingredient-form';
import { PageHeader } from '@/components/shell';

export default async function NewIngredient() {
  const { db, profile } = await requireAdminShell();
  const [canWrite, allergens, categoryResult, unitsResult] = await Promise.all([
    hasPermission(db, 'master_data.write'),
    rows(db, 'allergens', rowSchemas.allergens),
    db
      .from('reference_options')
      .select('code,label_en,label_es')
      .eq('list_code', 'ingredient_category')
      .eq('active', true)
      .order('sort_order'),
    db.from('uoms').select('code,label_en,label_es,family_code,measurement_system')
      .eq('active', true).eq('is_inventory_unit', true).order('sort_order'),
  ]);
  if (!canWrite) redirect('/app/ingredients');
  const categories = readResult(
    categoryResult,
    rowSchemas.reference_options.pick({ code: true, label_en: true, label_es: true }).array(),
    'ingredient_categories',
  );
  const baseUnits = readResult(
    unitsResult,
    rowSchemas.uoms.pick({ code: true, label_en: true, label_es: true, family_code: true, measurement_system: true }).array(),
    'inventory_uoms',
  );
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
          baseUnits={baseUnits}
          locale={profile.preferred_locale}
        />
      </section>
    </>
  );
}
