import { requireAdminShell } from '@/lib/auth';
import PhaseGate from '@/components/phase-gate';

export default async function Orders() {
  const { profile } = await requireAdminShell();
  const es = profile.preferred_locale === 'es';
  return (
    <PhaseGate
      eyebrow={es ? 'DEMANDA' : 'DEMAND'}
      title={es ? 'Pedidos de clientes' : 'Customer orders'}
      description={
        es
          ? 'Los pedidos determinan galones, lotes de 40 galones y requisitos de ingredientes.'
          : 'Orders will drive gallons, 40-gallon batches and ingredient requirements.'
      }
      nextStep={
        es
          ? 'La entrada de pedidos se abre después de que estén disponibles los productos y las versiones activas de recetas.'
          : 'Order entry opens after products and active recipe versions are available, so every ordered gallon can produce a reliable plan.'
      }
      href="/app/recipes"
      linkLabel={es ? 'Ver etapa de recetas' : 'View recipe gate'}
      locale={profile.preferred_locale}
    />
  );
}
