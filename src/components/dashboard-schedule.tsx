import Link from 'next/link';
import { ArrowRight, CalendarDays, Users } from 'lucide-react';
import { inclusiveScheduleEnd, scheduleKindLabel } from '@/domain/scheduling';

type UpcomingScheduleItem = {
  id: string;
  startOn: string;
  endOn: string;
  kind: 'mixing' | 'spices' | 'making_product' | 'cleaning' | 'off' | 'other';
  title: string;
  employeeCount: number;
};

/** Facility-scoped schedule summary for the operations dashboard. */
export default function DashboardSchedule({
  events,
  locale,
}: {
  events: UpcomingScheduleItem[];
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  return (
    <section className="dashboard-schedule panel" aria-labelledby="dashboard-schedule-heading">
      <div className="dashboard-panel-heading">
        <div>
          <p className="eyebrow">{es ? 'PRÓXIMOS SIETE DÍAS' : 'NEXT SEVEN DAYS'}</p>
          <h2 id="dashboard-schedule-heading">{es ? 'Programa del equipo' : 'Team schedule'}</h2>
        </div>
        <CalendarDays size={24} aria-hidden />
      </div>
      {events.length ? (
        <ol className="dashboard-schedule-list">
          {events.map((event) => (
            <li key={event.id}>
              <span className="dashboard-schedule-date">
                <strong>{event.startOn.slice(8)}</strong>
                <small>{event.startOn.slice(5, 7)}</small>
              </span>
              <span className="dashboard-schedule-copy">
                <strong>{event.title || scheduleKindLabel(event.kind, locale)}</strong>
                <small>
                  {event.startOn === inclusiveScheduleEnd(event.endOn)
                    ? event.startOn
                    : `${event.startOn} – ${inclusiveScheduleEnd(event.endOn)}`}
                </small>
              </span>
              <span className="dashboard-schedule-staff">
                <Users size={15} aria-hidden />
                {event.employeeCount}
              </span>
            </li>
          ))}
        </ol>
      ) : (
        <div className="dashboard-empty dashboard-schedule-empty">
          <CalendarDays size={28} aria-hidden />
          <h3>{es ? 'No hay trabajo programado' : 'No work scheduled yet'}</h3>
          <p>
            {es
              ? 'Programa el próximo turno para dar al equipo una ruta clara.'
              : 'Schedule the next shift to give the team a clear path forward.'}
          </p>
        </div>
      )}
      <Link className="dashboard-footer-link" href="/app/scheduling">
        {es ? 'Abrir programación del equipo' : 'Open team schedule'}
        <ArrowRight size={17} aria-hidden />
      </Link>
    </section>
  );
}
