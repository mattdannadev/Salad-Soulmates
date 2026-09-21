import { redirect } from 'next/navigation';
import { z } from 'zod';
import { rowSchemas } from '@/domain/master-data';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { rows, readResult } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import { AccessProfileForm } from '@/components/settings-forms';

export default async function ProfileManagementPage() {
  const { db, profile } = await requireAdminShell();
  const allowed = await hasPermission(db, 'settings.manage');
  if (!allowed) redirect('/app');
  const [permissionResult, profiles, assignments] = await Promise.all([
    db.from('permissions').select('*').order('area').order('code'),
    rows(db, 'access_profiles', rowSchemas.access_profiles),
    db.from('access_profile_permissions').select('access_profile_id,permission_code'),
  ]);
  const permissions = readResult(permissionResult, rowSchemas.permissions.array(), 'permissions');
  const assigned = readResult(
    assignments,
    z.array(z.object({ access_profile_id: z.uuid(), permission_code: z.string() })),
    'permission_assignments',
  );
  const isSpanish = profile.preferred_locale === 'es';
  return (
    <>
      <PageHeader
        eyebrow={isSpanish ? 'ADMINISTRACIÓN DE USUARIOS' : 'USER MANAGEMENT'}
        title={isSpanish ? 'Administración de perfiles' : 'Profile Management'}
        description={isSpanish
          ? 'Defina perfiles de acceso reutilizables y las acciones permitidas para cada perfil.'
          : 'Define reusable access profiles and the actions allowed for each profile.'}
      />
      <section className="panel">
        <h2>{isSpanish ? 'Perfiles de acceso' : 'Access profiles'}</h2>
        <p>
          {isSpanish
            ? 'Los perfiles del sistema muestran el modelo de seguridad integrado. Cree perfiles personalizados cuando una persona necesite una combinación diferente de acciones.'
            : 'System profiles show the built-in security model. Create custom profiles when a person needs a different combination of actions.'}
        </p>
        <div className="settings-stack">
          {profiles.map((accessProfile) => (accessProfile.is_system ? (
            <article className="settings-summary" key={accessProfile.id}>
              <h3>{accessProfile.name}</h3>
              <p>{accessProfile.description}</p>
              <div>
                {assigned
                  .filter((assignment) => assignment.access_profile_id === accessProfile.id)
                  .map((assignment) => (
                    <span className="badge" key={assignment.permission_code}>
                      {permissions.find((item) => item.code === assignment.permission_code)?.label}
                    </span>
                  ))}
              </div>
              <details>
                <summary>
                  {isSpanish ? 'Configurar áreas de acceso' : 'Configure access areas'}
                </summary>
                <AccessProfileForm
                  profile={accessProfile}
                  permissions={permissions}
                  selected={assigned
                    .filter((assignment) => assignment.access_profile_id === accessProfile.id)
                    .map((assignment) => assignment.permission_code)}
                  lockProfile
                />
              </details>
            </article>
          ) : (
            <details key={accessProfile.id}>
              <summary>{accessProfile.name}</summary>
              <AccessProfileForm
                profile={accessProfile}
                permissions={permissions}
                selected={assigned
                  .filter((assignment) => assignment.access_profile_id === accessProfile.id)
                  .map((assignment) => assignment.permission_code)}
              />
            </details>
          )))}
          <details>
            <summary>
              {isSpanish ? 'Crear perfil de acceso personalizado' : 'Create custom access profile'}
            </summary>
            <AccessProfileForm permissions={permissions} />
          </details>
        </div>
      </section>
    </>
  );
}
