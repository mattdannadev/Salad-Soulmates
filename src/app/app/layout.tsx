import { requireAdminShell } from '@/lib/auth';
import { Shell } from '@/components/shell';
export const dynamic = 'force-dynamic';
export default async function Layout({ children }: { children: React.ReactNode }) {
  const { profile } = await requireAdminShell();
  return (
    <Shell name={profile.display_name} role={profile.role}>
      {children}
    </Shell>
  );
}
