import { requireAdminShell } from '@/lib/auth';
import { Shell } from '@/components/shell';
import { z } from 'zod';
import { readResult } from '@/lib/data';

export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { db, profile } = await requireAdminShell();
  const [result, feedbackResult] = await Promise.all([
    db.from('access_profile_permissions').select('permission_code').eq('access_profile_id', profile.access_profile_id),
    db.from('reference_options').select('code,label_en,label_es').eq('list_code', 'feedback_type').eq('active', true).order('sort_order'),
  ]);
  const permissionRows = readResult(
    result,
    z.array(z.object({ permission_code: z.string() })),
    'navigation_permissions',
  );
  const feedbackTypes = readResult(feedbackResult, z.array(z.object({ code: z.string(), label_en: z.string(), label_es: z.string() })), 'feedback_types');
  return (
    <Shell
      name={profile.display_name}
      role={profile.role}
      locale={profile.preferred_locale}
      permissions={permissionRows.map((row) => row.permission_code)}
      feedbackTypes={feedbackTypes}
    >
      {children}
    </Shell>
  );
}
