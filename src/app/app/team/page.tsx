import { requireAdminShell } from '@/lib/auth';
import { PhaseGate } from '@/components/phase-gate';
export default async function Team() {
  await requireAdminShell();
  return (
    <PhaseGate
      eyebrow="WORKFORCE"
      title="Team scheduling"
      description="Worker availability, assignments and PTO will support the production schedule."
      nextStep="Scheduling opens with the production plan and precedes the Spanish-first mobile batch worksheet experience."
      href="/app/planning"
      linkLabel="View planning gate"
    />
  );
}
