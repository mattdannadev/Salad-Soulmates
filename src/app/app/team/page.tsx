import { requireAdminShell } from '@/lib/auth';
import PhaseGate from '@/components/phase-gate';

export default async function Team() {
  const { profile } = await requireAdminShell();
  const es = profile.preferred_locale === 'es';
  return (
    <PhaseGate
      eyebrow={es ? 'PERSONAL' : 'WORKFORCE'}
      title={es ? 'Programación del equipo' : 'Team scheduling'}
      description={
        es
          ? 'La disponibilidad, asignaciones y tiempo libre respaldarán el programa de producción.'
          : 'Worker availability, assignments and PTO will support the production schedule.'
      }
      nextStep={
        es
          ? 'La programación se abre con el plan de producción y precede la experiencia móvil de hojas de lote.'
          : 'Scheduling opens with the production plan and precedes the Spanish-first mobile batch worksheet experience.'
      }
      href="/app/planning"
      linkLabel={es ? 'Ver etapa de planificación' : 'View planning gate'}
      locale={profile.preferred_locale}
    />
  );
}
