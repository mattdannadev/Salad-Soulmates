import { requireAdminShell } from '@/lib/auth';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { db, profile } = await requireAdminShell();
  const { data: permissionRows, error } = await db
    .from('access_profile_permissions')
    .select('permission_code')
    .eq('access_profile_id', profile.access_profile_id);
  if (error) throw new Error('Unable to load navigation permissions.');
  return (
    <Shell
      name={profile.display_name}
      role={profile.role}
      locale={profile.preferred_locale}
      permissions={(permissionRows ?? []).map((row) => row.permission_code)}
    >
      {children}
    </Shell>
  );
}
