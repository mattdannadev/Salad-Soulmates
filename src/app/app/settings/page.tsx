import hasPermission from '@/lib/permissions';
import { rowSchemas } from '@/domain/master-data';
import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import { rows, readResult } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import { ReferenceDataManager } from '@/components/settings-forms';
import UomCatalogManager from '@/components/uom-catalog-manager';
import { z } from 'zod';

export default async function SettingsPage() {
  const { db } = await requireAdminShell();
  const allowed = await hasPermission(db, 'settings.manage');
  if (!allowed) redirect('/app');
  const [listResult, options, familyResult, unitResult] = await Promise.all([
    db.from('reference_lists').select('*').order('area').order('code'),
    rows(db, 'reference_options', rowSchemas.reference_options),
    db.from('uom_families').select('code,label_en,label_es,sort_order,active').order('sort_order'),
    db.from('uoms').select('*').order('sort_order'),
  ]);
  const lists = readResult(listResult, rowSchemas.reference_lists.array(), 'reference_lists');
  const families = readResult(familyResult, z.array(z.object({ code: z.string(), label_en: z.string(), label_es: z.string(), sort_order: z.number(), active: z.boolean() })), 'uom_families');
  const units = readResult(unitResult, rowSchemas.uoms.array(), 'uoms');
  const pageDescription = 'Manage the shared business values used across Salad Soulmates.';
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Configuration"
        description={pageDescription}
      />
      <UomCatalogManager families={families} units={units} />
      <ReferenceDataManager lists={lists} options={options} />
    </>
  );
}
