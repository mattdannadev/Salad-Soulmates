import OperationsCopilot from '@/components/operations-copilot';
import { PageHeader } from '@/components/shell';
import { requireAdminShell } from '@/lib/auth';
import { redirect } from 'next/navigation';

export default async function OperationsCopilotPage() {
  const { profile } = await requireAdminShell();
  if (profile.role !== 'admin') redirect('/app');
  return (
    <>
      <PageHeader
        eyebrow="READ-ONLY OPERATIONS"
        title="Operations Copilot"
        description="Find recipes and customer orders with safe, permission-aware checks."
      />
      <OperationsCopilot />
    </>
  );
}
