import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import FeedbackDrawer from '@/components/feedback';
import WorkerPreparations from '@/components/worker-preparations';
import {
  inclusiveScheduleEnd, scheduleKindLabel, selectLinkedPreparation,
} from '@/domain/scheduling';
import { requireProfile } from '@/lib/auth';
import { loadMyWorkforceSchedule } from '@/services/scheduling';
import loadWorkerPreparations from '@/services/worker-preparations';

export const dynamic = 'force-dynamic';

export default async function WorkerTask({ params }: {
  params: Promise<{ assignmentId: string }>;
}) {
  const parsed = z.uuid().safeParse((await params).assignmentId);
  if (!parsed.success) notFound();
  const { db, profile } = await requireProfile();
  const today = new Date();
  const start = new Date(today.getTime() - 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const end = new Date(today.getTime() + 180 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const schedule = await loadMyWorkforceSchedule(start, end);
  const assignment = schedule.events.find((event) => event.id === parsed.data);
  if (!assignment) notFound();
  const es = profile.preferred_locale === 'es';
  const preparations = assignment.linked_task_type === 'planned_spice_preparation'
    || assignment.linked_task_type === 'planned_mixer_batch'
    ? await loadWorkerPreparations(db) : null;
  const linkedPreparation = preparations && assignment.linked_task_id
    && (assignment.linked_task_type === 'planned_spice_preparation'
      || assignment.linked_task_type === 'planned_mixer_batch')
    ? selectLinkedPreparation(
      assignment.linked_task_type,
      assignment.linked_task_id,
      preparations,
    ) : undefined;
  return (
    <main className="worker-page" lang={profile.preferred_locale}>
      <Link className="button secondary" href="/worker">{es ? 'Mi horario' : 'My schedule'}</Link>
      <p className="eyebrow">{es ? 'TAREA ASIGNADA' : 'ASSIGNED TASK'}</p>
      <h1>{assignment.title || scheduleKindLabel(assignment.kind, profile.preferred_locale)}</h1>
      <section className="panel">
        <p>
          {assignment.start_on}
          {' '}
          –
          {' '}
          {inclusiveScheduleEnd(assignment.end_on)}
        </p>
        {assignment.product_name && (
        <p>
          {es ? 'Producto' : 'Product'}
          :
          {' '}
          {assignment.product_name}
        </p>
        )}
        {assignment.customer_name && (
        <p>
          {es ? 'Cliente' : 'Customer'}
          :
          {' '}
          {assignment.customer_name}
        </p>
        )}
        {assignment.location_label && (
        <p>
          {es ? 'Lugar' : 'Location'}
          :
          {' '}
          {assignment.location_label}
        </p>
        )}
        {assignment.lot_code && (
        <p>
          {es ? 'Lote' : 'Lot'}
          :
          {' '}
          {assignment.lot_code}
        </p>
        )}
        {assignment.batch_sequence && (
        <p>
          {es ? 'Mezcla' : 'Mixer batch'}
          {' '}
          {assignment.batch_sequence}
          {' '}
          · 40 gal
        </p>
        )}
        {assignment.linked_task_type === 'planned_spice_preparation' && (
        <p>
          {es ? 'Cubeta de especias' : 'Spice bucket'}
          :
          {assignment.linked_task_id}
        </p>
        )}
        {assignment.production_plan_id && (
        <p>
          {es ? 'Plan de producción' : 'Production plan'}
          :
          {assignment.production_plan_id}
        </p>
        )}
        {assignment.linked_task_type === 'order' && (
        <p>
          {es ? 'Pedido' : 'Order'}
          :
          {assignment.linked_task_id}
        </p>
        )}
        <p>
          {es ? 'Esta tarea está en tu horario publicado. Solicita ayuda si falta información.'
            : 'This task is on your published schedule. Request help if details are missing.'}
        </p>
      </section>
      {linkedPreparation && (
        <WorkerPreparations preparations={[linkedPreparation]} locale={profile.preferred_locale} />
      )}
      <FeedbackDrawer locale={profile.preferred_locale} />
    </main>
  );
}
