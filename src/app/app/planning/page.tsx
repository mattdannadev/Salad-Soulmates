import { requireAdminShell } from '@/lib/auth';
import { PhaseGate } from '@/components/phase-gate';
export default async function Planning() {
  await requireAdminShell();
  return (
    <PhaseGate
      eyebrow="ORDER-DRIVEN PLANNING"
      title="Production planning"
      description="Confirmed demand becomes 40-gallon mixer batches with one spice bucket per batch."
      nextStep="Planning opens after order entry. The calculation and override rules will be validated before production records can be created."
      href="/app/orders"
      linkLabel="View order gate"
    />
  );
}
