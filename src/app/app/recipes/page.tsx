import { requireAdminShell } from '@/lib/auth';
import { PhaseGate } from '@/components/phase-gate';
export default async function Recipes() {
  await requireAdminShell();
  return (
    <PhaseGate
      eyebrow="PRODUCTION MASTER DATA"
      title="Recipes"
      description="Versioned recipes will power requirements and simple Spanish worker batch worksheets."
      nextStep="Recipes open after ingredients, allergens, suppliers and supplier packs are reviewed. This keeps recipe quantities tied to trusted units."
      href="/app/ingredients"
      linkLabel="Review ingredients"
    />
  );
}
