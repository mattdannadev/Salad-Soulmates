import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/shell';
import WorkforceScheduler from '@/components/scheduling/scheduler';
import { requireProfile } from '@/lib/auth';
import loadSchedule from '@/services/scheduling';

function addDays(date: string, days: number) {
  const year = Number(date.slice(0, 4));
  const month = Number(date.slice(5, 7));
  const day = Number(date.slice(8, 10));
  return new Date(Date.UTC(year, month - 1, day + days)).toISOString().slice(0, 10);
}

export default async function Scheduling({ searchParams }: {
  searchParams: Promise<{ start?: string; end?: string }>;
}) {
  const { profile } = await requireProfile();
  if (!profile.facility_id) notFound();
  const query = z.object({ start: z.iso.date().optional(), end: z.iso.date().optional() })
    .safeParse(await searchParams);
  if (!query.success || Boolean(query.data.start) !== Boolean(query.data.end)
    || (query.data.start && query.data.end && (query.data.end < query.data.start
      || query.data.end > addDays(query.data.start, 365)))) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const start = query.data.start ?? addDays(today, -180);
  const end = query.data.end ? addDays(query.data.end, 1) : addDays(today, 180);
  const data = await loadSchedule(profile.facility_id, start, end);
  if (!data) notFound();
  const es = profile.preferred_locale === 'es';
  return (
    <>
      <PageHeader
        eyebrow={es ? 'PERSONAL' : 'WORKFORCE'}
        title={es ? 'Programación del equipo' : 'Team scheduling'}
        description={es
          ? 'Prepare borradores, registre ausencias y publique el horario del equipo.'
          : 'Prepare drafts, record time off, and publish the team schedule.'}
      />
      <WorkforceScheduler
        locale={profile.preferred_locale}
        facilities={[{
          id: data.facility.id,
          name: data.facility.name,
          weeklyHours: data.facility.weekly_capacity_hours,
        }]}
        employees={data.employees.map((employee) => ({
          id: employee.id,
          name: employee.display_name,
          facilityId: data.facility.id,
          availableDays: employee.available_days,
        }))}
        assignments={data.events.map((event) => ({
          id: event.id,
          revision: event.revision,
          facilityId: event.facility_id,
          startDate: event.start_on,
          endDate: addDays(event.end_on, -1),
          type: event.kind,
          employeeIds: event.employee_ids,
          note: event.title || null,
          productionPlanId: event.production_plan_id,
          linkedTaskType: event.linked_task_type,
          linkedTaskId: event.linked_task_id,
          productId: event.product_id,
          customerId: event.customer_id,
          locationLabel: event.location_label,
          availabilityOverrideReason: event.availability_override_reason,
        }))}
        publishedAssignments={data.published_events.map((event) => ({
          id: event.id,
          startDate: event.start_on,
          endDate: addDays(event.end_on, -1),
          type: event.kind,
          employeeIds: event.employee_ids,
          note: event.title || null,
          productionPlanId: event.production_plan_id,
          linkedTaskType: event.linked_task_type,
          linkedTaskId: event.linked_task_id,
          productId: event.product_id,
          customerId: event.customer_id,
          locationLabel: event.location_label,
        }))}
        publicationRevision={data.publication_revision}
        pto={data.pto.map((block) => ({
          id: block.id,
          employeeId: block.employee_id,
          startDate: block.start_on,
          endDate: addDays(block.end_on, -1),
          startMinute: block.start_minute,
          endMinute: block.end_minute,
          privateNote: block.private_note,
          revision: block.revision,
        }))}
        productionBands={data.production_plans.map((plan) => ({
          id: plan.id,
          label: `${es ? 'Plan de producción' : 'Production plan'} ${plan.id.slice(0, 8)}`,
          startDate: plan.start_on,
          endDate: plan.finish_on,
        }))}
        linkedTasks={data.linked_tasks.map((task) => ({
          type: task.type,
          id: task.id,
          productionPlanId: task.production_plan_id,
          label: task.label,
        }))}
        products={data.products}
        customers={data.customers}
        canManage={data.canManage}
        canManageSettings={data.canManageSettings}
        initialPeriodStart={query.data.start}
        initialPeriodEnd={query.data.end}
      />
    </>
  );
}
