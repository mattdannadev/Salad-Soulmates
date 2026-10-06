import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell';
import WorkTypeManager from '@/components/work-type-manager';
import { recipeProcessConfigurationSchema } from '@/domain/process-profiles';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';

/**
 * Work Types are the reusable templates selected by recipe Process Profiles.
 */
export default async function WorkTypesPage() {
  const { db, profile } = await requireAdminShell();
  if (!(await hasPermission(db, 'products.read'))) redirect('/app/settings');
  const result = await db.rpc('list_recipe_process_configuration');
  const parsedConfiguration = recipeProcessConfigurationSchema.safeParse(result.data);
  // A local or newly provisioned workspace can briefly be behind the app's
  // migrations. Keep setup reachable instead of silently bouncing users back.
  const configuration = parsedConfiguration.success
    ? parsedConfiguration.data
    : { work_types: [], process_profiles: [] };
  const canWrite = await hasPermission(db, 'products.write');
  const locale = profile.preferred_locale;
  return (
    <>
      <PageHeader
        eyebrow={locale === 'es' ? 'CONFIGURACIÓN · OPERACIONES' : 'SETTINGS · OPERATIONS'}
        title={locale === 'es' ? 'Tipos de trabajo' : 'Work Types'}
        description={
          locale === 'es'
            ? 'Configura las plantillas reutilizables que un perfil de proceso asigna a una receta.'
            : 'Set up the reusable templates that a Process Profile assigns to a recipe.'
        }
      />
      <WorkTypeManager
        initialWorkTypes={configuration.work_types}
        locale={locale}
        canWrite={canWrite}
      />
    </>
  );
}
