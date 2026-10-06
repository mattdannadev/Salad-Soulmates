import hasPermission from '@/lib/permissions';
import { rowSchemas } from '@/domain/master-data';
import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import { rows, readResult } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import { ReferenceDataManager } from '@/components/settings-forms';
import UomCatalogManager from '@/components/uom-catalog-manager';
import { z } from 'zod';
import Link from 'next/link';

export default async function SettingsPage() {
  const { db } = await requireAdminShell();
  const allowed = await hasPermission(db, 'settings.manage');
  if (!allowed) redirect('/app');
  const [listResult, options, familyResult, unitResult, organizationResult] = await Promise.all([
    db.from('reference_lists').select('*').order('area').order('code'),
    rows(db, 'reference_options', rowSchemas.reference_options),
    db.from('uom_families').select('code,label_en,label_es,sort_order,active').order('sort_order'),
    db.from('uoms').select('*').order('sort_order'),
    db.from('organizations').select('measurement_system').single(),
  ]);
  const lists = readResult(listResult, rowSchemas.reference_lists.array(), 'reference_lists');
  const families = readResult(
    familyResult,
    z.array(
      z.object({
        code: z.string(),
        label_en: z.string(),
        label_es: z.string(),
        sort_order: z.number(),
        active: z.boolean(),
      }),
    ),
    'uom_families',
  );
  const units = readResult(unitResult, rowSchemas.uoms.array(), 'uoms');
  const organization = readResult(
    organizationResult,
    z.object({ measurement_system: z.enum(['metric', 'imperial']) }),
    'organization_measurement_system',
  );
  const pageDescription = 'Manage the shared business values used across Salad Soulmates.';
  return (
    <>
      <PageHeader eyebrow="ADMINISTRATION" title="Configuration" description={pageDescription} />
      <section className="panel" aria-label="Operations configuration">
        <p className="eyebrow">OPERATIONS</p>
        <h2>Process setup</h2>
        <p>Set up reusable Work Types, then assign the right flow to each recipe.</p>
        <div className="process-setup-actions">
          <Link className="button" href="/app/settings/work-types">
            1. Set up Work Types
          </Link>
          <Link className="button secondary" href="/app/settings/process-profiles">
            2. Assign recipe flows
          </Link>
        </div>
      </section>
      <ReferenceDataManager
        lists={lists}
        options={options}
        unitManager={<UomCatalogManager
          families={families}
          units={units}
          measurementSystem={organization.measurement_system}
          embedded
        />}
      />
    </>
  );
}
