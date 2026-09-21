import hasPermission from '@/lib/permissions';
import { rowSchemas } from '@/domain/master-data';
import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import { rows, readResult } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import { ReferenceOptionForm } from '@/components/settings-forms';

export default async function SettingsPage() {
  const { db } = await requireAdminShell();
  const allowed = await hasPermission(db, 'settings.manage');
  if (!allowed) redirect('/app');
  const [listResult, options] = await Promise.all([
    db.from('reference_lists').select('*').order('area').order('code'),
    rows(db, 'reference_options', rowSchemas.reference_options),
  ]);
  const lists = readResult(listResult, rowSchemas.reference_lists.array(), 'reference_lists');
  const areas = [...new Set(lists.map((list) => list.area))].sort();
  const pageDescription = 'Manage dropdown values and reference data by business area.';
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Settings"
        description={pageDescription}
      />
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
