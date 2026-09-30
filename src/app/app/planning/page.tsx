import Link from 'next/link';
import { redirect } from 'next/navigation';
import { CalendarDays, ClipboardList, Package } from 'lucide-react';
import { PageHeader } from '@/components/shell';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';

type PlanningDestination = {
  href: string;
  title: string;
  description: string;
  icon: typeof ClipboardList;
};

export default async function Planning() {
  const { db, profile } = await requireAdminShell();
  const [canPlan, canReadOrders, canReadInventory, canReadSchedule] = await Promise.all([
    hasPermission(db, 'planning.read'),
    hasPermission(db, 'orders.read'),
    hasPermission(db, 'inventory.read'),
    hasPermission(db, 'workforce.read'),
  ]);
  if (!canPlan) redirect('/app');

  const es = profile.preferred_locale === 'es';
  const destinations: PlanningDestination[] = [
    ...(canReadOrders
      ? [
          {
            href: '/app/orders',
            title: es ? 'Demanda de clientes' : 'Customer demand',
            description: es
              ? 'Revisa pedidos, fechas de recogida y requisitos de ingredientes.'
              : 'Review orders, pickup dates, and ingredient requirements.',
            icon: ClipboardList,
          },
        ]
      : []),
    ...(canReadInventory
      ? [
          {
            href: '/app/inventory',
            title: es ? 'Disponibilidad de ingredientes' : 'Ingredient availability',
            description: es
              ? 'Consulta existencias, puntos de reposición y ajustes auditables.'
              : 'Review stock, reorder points, and auditable adjustments.',
            icon: Package,
          },
        ]
      : []),
    ...(canReadSchedule
      ? [
          {
            href: '/app/scheduling',
            title: es ? 'Programación del equipo' : 'Team scheduling',
            description: es
              ? 'Programa el trabajo y publica asignaciones para el equipo.'
              : 'Schedule work and publish assignments for the team.',
            icon: CalendarDays,
          },
        ]
      : []),
  ];

  return (
    <>
      <PageHeader
        eyebrow={es ? 'PLANIFICACIÓN Y PRODUCCIÓN' : 'PLANNING & PRODUCTION'}
        title={es ? 'Planificación de producción' : 'Production planning'}
        description={
          es
            ? 'Coordina demanda, disponibilidad y programación antes de publicar el trabajo del equipo.'
            : 'Coordinate demand, availability, and scheduling before publishing team work.'
        }
      />
      <section className="panel">
        <h2>{es ? 'Preparar el trabajo' : 'Prepare the work'}</h2>
        <p>
          {es
            ? 'Cada destino conserva su propia autorización y registros. La navegación no concede acceso adicional.'
            : 'Each destination keeps its own authorization and records. Navigation grants no additional access.'}
        </p>
        <div className="dashboard-metrics">
          {destinations.map((destination) => {
            const Icon = destination.icon;
            return (
              <Link className="dashboard-metric" href={destination.href} key={destination.href}>
                <Icon size={21} aria-hidden />
                <span>{destination.title}</span>
                <small>{destination.description}</small>
              </Link>
            );
          })}
        </div>
        {!destinations.length && (
          <p className="empty">
            {es
              ? 'Tu perfil puede ver la planificación, pero no sus registros relacionados. Pide acceso a un administrador.'
              : 'Your profile can view planning, but not its related records. Ask an administrator for access.'}
          </p>
        )}
      </section>
      <section className="panel">
        <h2>{es ? 'Handoff al equipo' : 'Worker handoff'}</h2>
        <p>
          {es
            ? 'Las tareas publicadas se entregan en el espacio de trabajo móvil del miembro asignado. Esta área administrativa no expone tareas ni datos del trabajador fuera de su asignación.'
            : 'Published tasks are delivered in the assigned worker’s mobile workspace. This administrative area does not expose worker tasks or data outside their assignment.'}
        </p>
      </section>
    </>
  );
}
