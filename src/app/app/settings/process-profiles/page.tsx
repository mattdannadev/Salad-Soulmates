import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell';
import ProcessProfileManager from '@/components/process-profile-manager';
import { recipeProcessConfigurationSchema } from '@/domain/process-profiles';
import { loadRecipeCatalog } from '@/lib/recipe-catalog';
import hasPermission from '@/lib/permissions';

/** Assigns reusable Work Types to recipes for future work generation. */
export default async function ProcessProfilesPage() {
  const { db, products, recipes, locale } = await loadRecipeCatalog();
  const [canManageSettings, canWrite, configurationResult] = await Promise.all([
    hasPermission(db, 'settings.manage'),
    hasPermission(db, 'products.write'),
    db.rpc('list_recipe_process_configuration'),
  ]);
  if (!canManageSettings) redirect('/app/settings');
  const parsedConfiguration = recipeProcessConfigurationSchema.safeParse(configurationResult.data);
  // Keep the setup directory readable while a newly provisioned workspace
  // catches up with the process-configuration migration.
  const configuration = parsedConfiguration.success
    ? parsedConfiguration.data
    : { work_types: [], process_profiles: [] };
  const productNames = new Map(products.map((product) => [product.id, product.name]));
  const rows = recipes
    .map((recipe) => ({
      id: recipe.id,
      name: recipe.name,
      productName:
        productNames.get(recipe.product_id) ??
        (locale === 'es' ? 'Producto no disponible' : 'Product unavailable'),
    }))
    .sort((left, right) => left.name.localeCompare(right.name, locale));

  return (
    <>
      <PageHeader
        eyebrow={locale === 'es' ? 'CONFIGURACIÓN · OPERACIONES' : 'SETTINGS · OPERATIONS'}
        title={locale === 'es' ? 'Perfiles del proceso' : 'Process Profiles'}
        description={
          locale === 'es'
            ? 'Asigne a cada receta un tipo de trabajo reutilizable y vea las órdenes que creará.'
            : 'Assign each recipe a reusable Work Type and see the work orders it will create.'
        }
      />
      <ProcessProfileManager
        recipes={rows}
        profiles={configuration.process_profiles}
        workTypes={configuration.work_types}
        canWrite={canWrite}
        locale={locale}
      />
    </>
  );
}
