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

function workweekStart(date: string) {
  const day = new Date(`${date}T00:00:00Z`).getUTCDay();
  return addDays(date, -((day + 6) % 7));
}

export default async function Scheduling({ searchParams }: {
  searchParams: Promise<{
    start?: string;
    end?: string;
    surface?: string;
    order?: string;
    date?: string;
    work?: string;
  }>;
}) {
  const { profile } = await requireProfile();
  if (!profile.facility_id) notFound();
  const query = z.object({
    start: z.iso.date().optional(),
    end: z.iso.date().optional(),
    date: z.iso.date().optional(),
    surface: z.enum(['board', 'calendar']).optional(),
    order: z.uuid().optional(),
    work: z.uuid().optional(),
  })
    .safeParse(await searchParams);
  if (!query.success || Boolean(query.data.start) !== Boolean(query.data.end)
    || (query.data.start && query.data.end && (query.data.end < query.data.start
      || query.data.end > addDays(query.data.start, 365)))) notFound();
  const today = new Date().toISOString().slice(0, 10);
  const requestedStart = query.data.start ?? addDays(today, -180);
  const requestedEnd = query.data.end ? addDays(query.data.end, 1) : addDays(today, 180);
  // "View execution schedule" deliberately drills into one work day. If that
  // URL is then opened in Production Plan, load the complete planning week so
  // its customer → order → stage tree retains every batch instead of only the
  // selected day's work. Calendar remains a true single-day drill-in.
  const planWeekStart = query.data.surface === 'calendar' || !query.data.start
    ? requestedStart
    : workweekStart(query.data.start);
  const planWeekEnd = query.data.surface === 'calendar' || !query.data.start
    ? requestedEnd
    : addDays(planWeekStart, 14);
  const data = await loadSchedule(profile.facility_id, planWeekStart, planWeekEnd);
  if (!data) notFound();
  if (query.data.order && !data.customer_orders.some((order) => (
    order.id === query.data.order
  ))) {
    notFound();
  }
  const focusedWork = query.data.work
    ? data.events.find((event) => event.id === query.data.work) : undefined;
  if (query.data.work && (!focusedWork
    || (query.data.date && focusedWork.start_on !== query.data.date))) {
    notFound();
  }
  if (query.data.order && focusedWork && (focusedWork.linked_task_type !== 'order'
    || focusedWork.linked_task_id !== query.data.order)) notFound();
  const es = profile.preferred_locale === 'es';
  return (
    <div className="scheduling-page">
      <PageHeader
        eyebrow={es ? 'PERSONAL' : 'WORKFORCE'}
        title={es ? 'Planificación de producción' : 'Production Planning'}
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
          timezone: data.facility.timezone,
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
          startAt: event.start_at,
          endAt: event.end_at,
          allDay: event.all_day,
          timeZone: event.timezone,
          startDate: event.start_on,
          endDate: addDays(event.end_on, -1),
          type: event.kind,
          plannedBatchCount: event.planned_batch_count,
          completed: event.completed,
          requiredWorkerCount: event.required_worker_count,
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
          startAt: event.start_at,
          endAt: event.end_at,
          allDay: event.all_day,
          timeZone: event.timezone,
          startDate: event.start_on,
          endDate: addDays(event.end_on, -1),
          type: event.kind,
          requiredWorkerCount: event.required_worker_count,
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
          ptoTypeId: block.pto_type_id,
          privateNote: block.private_note,
          revision: block.revision,
        }))}
        ptoTypes={data.pto_types.map((type) => ({
          id: type.id,
          name: type.name,
          color: type.color,
          active: type.active,
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
        customerOrders={data.customer_orders.map((order) => ({
          id: order.id,
          customerId: order.customer_id,
          customerName: order.customer_name,
          reference: order.reference,
          pickupDate: order.needed_on,
          receivedDate: order.created_on,
          productionCompleteDate: data.production_plans
            .find((plan) => plan.id === order.id)?.finish_on,
          orderBatchCount: order.order_batch_count,
          caseCount: order.case_count,
        }))}
        supplierDeliveries={data.supplier_deliveries.map((delivery) => ({
          id: delivery.id,
          supplierName: delivery.supplier_name,
          reference: delivery.reference,
          expectedDate: delivery.expected_on,
          note: delivery.note,
          lines: delivery.lines.map((line) => ({
            ingredientName: line.ingredient_name,
            quantity: line.quantity,
            uom: line.uom,
          })),
        }))}
        customerProductIds={data.customer_product_ids}
        canManage={data.canManage}
        initialPeriodStart={query.data.start}
        initialPeriodEnd={query.data.end}
        initialSurface={query.data.surface}
        initialOrderId={query.data.order}
        initialFocusDate={query.data.date ?? (query.data.surface === 'calendar' ? undefined : query.data.start)}
        initialWorkId={query.data.work}
      />
    </div>
  );
}
