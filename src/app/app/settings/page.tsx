import hasPermission from '@/lib/permissions';
import { rowSchemas } from '@/domain/master-data';
import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import { rows, readResult } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import { ReferenceOptionForm, AccessProfileForm } from '@/components/settings-forms';

export default async function SettingsPage() {
  const { db } = await requireAdminShell();
  const allowed = await hasPermission(db, 'settings.manage');
  if (!allowed) redirect('/app');
  const [listResult, options, permissionResult, profiles, assignments] = await Promise.all([
    db.from('reference_lists').select('*').order('area').order('code'),
    rows(db, 'reference_options', rowSchemas.reference_options),
    db.from('permissions').select('*').order('area').order('code'),
    rows(db, 'access_profiles', rowSchemas.access_profiles),
    db.from('access_profile_permissions').select('access_profile_id,permission_code'),
  ]);
  const lists = readResult(listResult, rowSchemas.reference_lists.array(), 'reference_lists');
  const permissions = readResult(permissionResult, rowSchemas.permissions.array(), 'permissions');
  const assigned = readResult(
    assignments,
    z.array(z.object({ access_profile_id: z.uuid(), permission_code: z.string() })),
    'permission_assignments',
  );
  const areas = [...new Set(lists.map((list) => list.area))].sort();
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Settings"
        description="Manage dropdown values by business area and define reusable access profiles for users."
      />
      <section className="panel">
        <h2>Access profiles</h2>
        <p>
          System profiles show the built-in security model. Create custom profiles when a person
          needs a different combination of actions.
        </p>
        <div className="settings-stack">
          {profiles.map((p) => (p.is_system ? (
            <article className="settings-summary" key={p.id}>
              <h3>{p.name}</h3>
              <p>{p.description}</p>
              <div>
                {assigned
                  .filter((a) => a.access_profile_id === p.id)
                  .map((a) => (
                    <span className="badge" key={a.permission_code}>
                      {permissions.find((x) => x.code === a.permission_code)?.label}
                    </span>
                  ))}
              </div>
              <details>
                <summary>Configure access areas</summary>
                <AccessProfileForm
                  profile={p}
                  permissions={permissions}
                  selected={assigned.filter((a) => a.access_profile_id === p.id).map((a) => a.permission_code)}
                  lockProfile
                />
              </details>
            </article>
          ) : (
            <details key={p.id}>
              <summary>{p.name}</summary>
              <AccessProfileForm
                profile={p}
                permissions={permissions}
                selected={assigned
                  .filter((a) => a.access_profile_id === p.id)
                  .map((a) => a.permission_code)}
              />
            </details>
          )))}
          <details>
            <summary>Create custom access profile</summary>
            <AccessProfileForm permissions={permissions} />
          </details>
        </div>
      </section>
      {areas.map((area) => (
        <section className="panel" key={area}>
          <p className="eyebrow">{area}</p>
          {lists
            .filter((list) => list.area === area)
            .map((list) => (
              <div className="settings-list" key={list.code}>
                <h2>
                  {list.name_en}
                  {' '}
                  /
                  {list.name_es}
                </h2>
                {options
                  .filter((option) => option.list_code === list.code)
                  .sort((a, b) => a.sort_order - b.sort_order)
                  .map((option) => (
                    <details key={option.id}>
                      <summary>
                        {option.label_en}
                        {' '}
                        /
                        {option.label_es}
                        {!option.active ? ' (Inactive)' : ''}
                      </summary>
                      <ReferenceOptionForm
                        listCode={list.code}
                        option={option}
                        allowCustom={list.allow_custom_values}
                      />
                    </details>
                  ))}
                {list.allow_custom_values ? (
                  <details>
                    <summary>Add value</summary>
                    <ReferenceOptionForm listCode={list.code} allowCustom />
                  </details>
                ) : null}
              </div>
            ))}
        </section>
      ))}
    </>
  );
}
