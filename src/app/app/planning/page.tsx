import { requireAdminShell } from '@/lib/auth';
import PhaseGate from '@/components/phase-gate';

export default async function Planning() {
  const { profile } = await requireAdminShell();
  const es = profile.preferred_locale === 'es';
  return (
    <PhaseGate
      eyebrow={es ? 'PLANIFICACIÓN SEGÚN PEDIDOS' : 'ORDER-DRIVEN PLANNING'}
      title={es ? 'Planificación de producción' : 'Production planning'}
      description={
        es
          ? 'La demanda confirmada se convierte en lotes de mezcla de 40 galones con un cubo de especias por lote.'
          : 'Confirmed demand becomes 40-gallon mixer batches with one spice bucket per batch.'
      }
      nextStep={
        es
          ? 'La planificación se abre después de ingresar pedidos. Las reglas de cálculo y ajuste se validarán antes de crear registros de producción.'
          : 'Planning opens after order entry. The calculation and override rules will be validated before production records can be created.'
      }
      href="/app/orders"
      linkLabel={es ? 'Ver etapa de pedidos' : 'View order gate'}
      locale={profile.preferred_locale}
    />
  );
}
