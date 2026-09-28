import Link from 'next/link';
import { redirect } from 'next/navigation';
import { Leaf, LogOut } from 'lucide-react';
import { requireProfile } from '@/lib/auth';
import { signOut } from '@/app/actions';
import FeedbackDrawer from '@/components/feedback';
import {
  addScheduleDays, facilityCalendarDateAt, groupWorkDays,
  inclusiveScheduleEnd, scheduleKindLabel,
} from '@/domain/scheduling';
import { loadMyWorkforceSchedule } from '@/services/scheduling';
import isMobileOperationsCopilotEnabled from '@/services/mobile-operations-copilot-gate';

export const dynamic = 'force-dynamic';

export default async function Worker() {
  const { profile } = await requireProfile();
  if (!profile.facility_id) redirect('/access');
  const now = new Date();
  const utcDay = now.toISOString().slice(0, 10);
  const scheduleStart = addScheduleDays(utcDay, -2);
  const scheduleEnd = addScheduleDays(utcDay, 92);
  const schedule = await loadMyWorkforceSchedule(scheduleStart, scheduleEnd);
  const today = facilityCalendarDateAt(now, schedule.timezone);
  const horizon = addScheduleDays(today, 90);
  const es = profile.preferred_locale === 'es';
  const dateFormatter = new Intl.DateTimeFormat(es ? 'es-MX' : 'en-US', {
    dateStyle: 'full', timeZone: 'UTC',
  });
  const days = groupWorkDays(schedule.events, today, horizon);
  return (
    <main className="worker-page" lang={profile.preferred_locale}>
      <header className="row">
        <Leaf size={34} />
        <form action={signOut}>
          <button type="submit" className="secondary">
            <LogOut size={18} />
            {es ? 'Salir' : 'Sign out'}
          </button>
        </form>
      </header>
      <p className="eyebrow">{es ? 'MI TRABAJO' : 'MY WORK'}</p>
      <h1>{es ? 'Mi horario' : 'My schedule'}</h1>
      <p>{`${es ? 'Hola' : 'Hello'}, ${profile.display_name.split(' ')[0]}. ${es ? 'Aquí está tu trabajo publicado.' : 'Here is your published work.'}`}</p>
      {isMobileOperationsCopilotEnabled() && (
        <nav aria-label={es ? 'Herramientas de producción' : 'Production tools'}>
          <Link className="button secondary" href="/worker/copilot">
            {es ? 'Abrir Copiloto de operaciones' : 'Open Operations Copilot'}
          </Link>
        </nav>
      )}
      {(profile.role === 'admin' || profile.role === 'reviewer') && (
        <nav aria-label={es ? 'Navegación del espacio de trabajo' : 'Workspace navigation'}>
          <Link className="button secondary" href="/app">{es ? 'Volver al panel' : 'Back to dashboard'}</Link>
        </nav>
      )}
      {!days.length && (
        <section className="panel">
          <h2>{es ? 'Sin trabajo publicado' : 'No published work'}</h2>
          <p>{es ? 'Tu horario aparecerá cuando se publique.' : 'Your schedule appears when it is published.'}</p>
        </section>
      )}
      {days.map(({ day, events: tasks }) => (
        <section
          className="worker-day"
          key={day}
          aria-label={dateFormatter.format(new Date(`${day}T00:00:00Z`))}
        >
          <div className="section-heading">
            <h2>{dateFormatter.format(new Date(`${day}T00:00:00Z`))}</h2>
            <span className="badge">
              {tasks.length}
              {' '}
              {es ? 'tareas' : 'tasks'}
            </span>
          </div>
          {tasks.map((task) => (
            <article className="panel" key={task.id}>
              <h3>{task.title || scheduleKindLabel(task.kind, profile.preferred_locale)}</h3>
              <p>
                {task.start_on}
                {' '}
                –
                {' '}
                {inclusiveScheduleEnd(task.end_on)}
              </p>
              {task.product_name && <p>{task.product_name}</p>}
              {task.customer_name && (
                <p>
                  {es ? 'Cliente' : 'Customer'}
                  :
                  {' '}
                  {task.customer_name}
                </p>
              )}
              {task.location_label && (
                <p>
                  {es ? 'Lugar' : 'Location'}
                  :
                  {' '}
                  {task.location_label}
                </p>
              )}
              {task.lot_code && (
                <p>
                  {es ? 'Lote' : 'Lot'}
                  :
                  {' '}
                  {task.lot_code}
                </p>
              )}
              {task.batch_sequence && (
                <p>
                  {es ? 'Mezcla' : 'Mixer batch'}
                  {' '}
                  {task.batch_sequence}
                  {' '}
                  · 40 gal
                </p>
              )}
              {task.production_plan_id && (
                <p>
                  {es ? 'Plan de producción' : 'Production plan'}
                  :
                  {' '}
                  {task.production_plan_id.slice(0, 8)}
                </p>
              )}
              <Link className="button" href={`/worker/task/${task.id}`}>
                {es ? 'Comenzar' : 'Start'}
              </Link>
            </article>
          ))}
        </section>
      ))}
      {schedule.pto.length > 0 && (
      <section className="panel">
        <h2>{es ? 'Mis ausencias' : 'My time off'}</h2>
        {schedule.pto.map((block) => (
          <p key={`${block.start_on}-${block.end_on}`}>
            {block.start_on}
            {' '}
            –
            {inclusiveScheduleEnd(block.end_on)}
          </p>
        ))}
      </section>
      )}
      <FeedbackDrawer locale={profile.preferred_locale} />
    </main>
  );
}
