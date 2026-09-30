import Link from 'next/link';
import {
  ArrowRight, CalendarDays, CircleAlert, UserRoundCheck, Users,
} from 'lucide-react';
import { inclusiveScheduleEnd, scheduleKindLabel } from '@/domain/scheduling';
import type { DashboardProductionPlan } from '@/services/dashboard-production-plans';
import styles from './dashboard-schedule.module.css';

interface UpcomingScheduleItem {
  id: string;
  startOn: string;
  endOn: string;
  kind: 'pre_op' | 'post_op' | 'ingredient_prep' | 'mixing' | 'receiving' | 'shipment_loading' | 'packaging' | 'cleaning' | 'off' | 'other';
  title: string;
  productionPlanId: string | null;
  employeeCount: number;
  assigneeNames: string[];
  ptoNames: string[];
}

/** Facility-scoped schedule summary for the operations dashboard. */
export default function DashboardSchedule({
  events,
  plans,
  locale,
}: {
  events: UpcomingScheduleItem[];
  plans: DashboardProductionPlan[];
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const staffingGaps = events.filter((event) => event.kind !== 'off' && event.employeeCount === 0).length;
  const timeOff = events.filter((event) => event.kind === 'off').length;
  const dayFormatter = new Intl.DateTimeFormat(locale === 'es' ? 'es-US' : 'en-US', {
    weekday: 'short',
    timeZone: 'UTC',
  });
  const pickupFormatter = new Intl.DateTimeFormat(es ? 'es-US' : 'en-US', {
    month: 'short', day: 'numeric', timeZone: 'UTC',
  });
  return (
    <section className={`dashboard-schedule panel ${styles.schedule}`} aria-labelledby="dashboard-schedule-heading">
      <div className="dashboard-panel-heading">
        <div>
          <p className="eyebrow">{es ? 'PRÓXIMOS SIETE DÍAS' : 'NEXT SEVEN DAYS'}</p>
          <h2 id="dashboard-schedule-heading">{es ? 'Semana de operaciones' : 'Operations week'}</h2>
          <p className={styles.intro}>
            {es
              ? 'Preparación, mezcla, producción y ausencias en una sola vista.'
              : 'Preparation, mixing, production, and time off in one view.'}
          </p>
        </div>
        <CalendarDays size={24} aria-hidden />
      </div>
      <div className={styles.summary} aria-label={es ? 'Resumen del programa' : 'Schedule summary'}>
        <span>
          <CalendarDays size={15} aria-hidden />
          <strong>{events.length}</strong>
          {' '}
          {es ? 'actividades' : 'scheduled'}
        </span>
        <span className={staffingGaps > 0 ? styles.attention : undefined}>
          <CircleAlert size={15} aria-hidden />
          <strong>{staffingGaps}</strong>
          {' '}
          {es ? 'sin personal' : 'staffing gaps'}
        </span>
        <span>
          <UserRoundCheck size={15} aria-hidden />
          <strong>{timeOff}</strong>
          {' '}
          {es ? 'ausencias' : 'time off'}
        </span>
      </div>
      {plans.length > 0 && (
        <section className={styles.productionPlans} aria-labelledby="weekly-production-plans-heading">
          <div>
            <p className="eyebrow">{es ? 'PLANES DE PEDIDOS' : 'ORDER PRODUCTION PLANS'}</p>
            <h3 id="weekly-production-plans-heading">{es ? 'Qué se está produciendo esta semana' : 'What is being produced this week'}</h3>
          </div>
          <ol>
            {plans.map((plan) => (
              <li key={plan.id} className={plan.status === 'Draft' ? styles.draft : undefined}>
                <span>
                  <strong>{plan.customerName || (es ? 'Pedido de cliente' : 'Customer order')}</strong>
                  {plan.products.map((product) => (
                    <small key={product.name} className={styles.productQuota}>
                      {product.name}
                      {' '}
                      ·
                      {product.batchCount}
                      {' '}
                      {es
                        ? (product.batchCount === 1 ? 'lote' : 'lotes')
                        : (product.batchCount === 1 ? 'batch' : 'batches')}
                    </small>
                  ))}
                  {plan.products.length === 0 && <small>{es ? 'Productos no disponibles' : 'Product details unavailable'}</small>}
                  <small>
                    {plan.spansOutsideWindow
                      ? (es ? 'Cantidad del plan completo · distribución semanal pendiente' : 'Full-plan quantity · weekly allocation pending')
                      : (es ? 'Planificados esta semana' : 'Planned this week')}
                  </small>
                </span>
                <span>
                  <strong>{plan.status === 'Confirmed' ? (es ? 'Confirmado' : 'Confirmed') : (es ? 'Borrador' : 'Draft')}</strong>
                  <small>
                    {`${es ? 'Recogida' : 'Pickup'} ${plan.pickupOn
                      ? pickupFormatter.format(new Date(`${plan.pickupOn}T12:00:00Z`))
                      : (es ? 'sin fecha' : 'date unavailable')}`}
                  </small>
                </span>
              </li>
            ))}
          </ol>
        </section>
      )}
      {events.length ? (
        <ol className="dashboard-schedule-list">
          {events.map((event) => (
            <li className={event.employeeCount === 0 && event.kind !== 'off' ? styles.unstaffed : undefined} key={event.id}>
              <span className="dashboard-schedule-date">
                <strong>{event.startOn.slice(8)}</strong>
                <small>{dayFormatter.format(new Date(`${event.startOn}T12:00:00Z`))}</small>
              </span>
              <span className="dashboard-schedule-copy">
                <strong>{event.title || scheduleKindLabel(event.kind, locale)}</strong>
                <small>
                  {scheduleKindLabel(event.kind, locale)}
                  {' '}
                  ·
                  {' '}
                  {event.startOn === inclusiveScheduleEnd(event.endOn)
                    ? event.startOn
                    : `${event.startOn} – ${inclusiveScheduleEnd(event.endOn)}`}
                </small>
                {event.assigneeNames.length > 0 && <small>{event.assigneeNames.join(', ')}</small>}
                {event.ptoNames.length > 0 && <small>{`${es ? 'Ausencia' : 'Time off'}: ${event.ptoNames.join(', ')}`}</small>}
              </span>
              <span className={`dashboard-schedule-staff ${styles.staff}`}>
                <Users size={15} aria-hidden />
                {event.employeeCount > 0
                  ? `${event.employeeCount} ${es ? 'asignados' : 'assigned'}`
                  : es
                    ? 'Sin asignar'
                    : 'Unassigned'}
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
        {es ? 'Abrir programación completa' : 'Open full schedule'}
        <ArrowRight size={17} aria-hidden />
      </Link>
    </section>
  );
}
