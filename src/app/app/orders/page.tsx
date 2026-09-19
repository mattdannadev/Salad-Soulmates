import { requireAdminShell } from '@/lib/auth';
import { PhaseGate } from '@/components/phase-gate';
export default async function Orders() {
  await requireAdminShell();
  return (
    <PhaseGate
      eyebrow="DEMAND"
      title="Customer orders"
      description="Orders will drive gallons, 40-gallon batches and ingredient requirements."
      nextStep="Order entry opens after products and active recipe versions are available, so every ordered gallon can produce a reliable plan."
      href="/app/recipes"
      linkLabel="View recipe gate"
    />
  );
}
