import Link from 'next/link';
import { ArrowRight, CalendarDays } from 'lucide-react';
import type { DashboardProductionPlan, DashboardScheduleOrderContext } from '@/services/dashboard-production-plans';
import { dashboardScheduleSummary } from '@/services/dashboard-schedule-summary';
import type { DashboardBatchEvent } from '@/services/dashboard-schedule-summary';
import styles from './dashboard-schedule.module.css';

function countLabel(count: number, unknown: boolean, es: boolean): string {
  const singular = es ? 'lote' : 'batch';
  const plural = es ? 'lotes' : 'batches';
  const unit = count === 1 ? singular : plural;
  if (unknown && count === 0) return es ? 'Cantidad no disponible' : 'Batch count unavailable';
  const pending = es ? ' + cantidad pendiente' : ' + unknown quantity';
  return `${count} ${unit}${unknown ? pending : ''}`;
}

/** Daily batch totals, nested by customer and order, for the operations dashboard. */
export default function DashboardSchedule({
  events, plans, planContexts = plans,
  scheduleStartOn = undefined, scheduleEndOn = undefined, locale,
}: {
  events: DashboardBatchEvent[];
  plans: DashboardProductionPlan[];
  planContexts?: DashboardScheduleOrderContext[];
  scheduleStartOn?: string;
  scheduleEndOn?: string;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const missingProductsLabel = es ? 'Productos no disponibles' : 'Products unavailable';
  const unassignedLabel = es ? 'Sin asignar' : 'Unassigned';
  const customers = dashboardScheduleSummary(events, planContexts, plans);
  const formatter = new Intl.DateTimeFormat(es ? 'es-US' : 'en-US', {
    weekday: 'short', month: 'short', day: 'numeric', timeZone: 'UTC',
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
            {es ? 'Lotes preparados y producidos cada día, por cliente y pedido.' : 'Batches prepped and produced each day, by customer and order.'}
          </p>
        </div>
        <CalendarDays size={24} aria-hidden />
      </div>
      {customers.length > 0 ? (
        <ul className={styles.customers}>
          {customers.map((customer) => (
            <li key={customer.key} className={styles.customer}>
              <h3>{customer.name || (es ? 'Cliente no disponible' : 'Customer unavailable')}</h3>
              <ul className={styles.orders}>
                {customer.orders.map((order) => (
                  <li key={order.key} className={styles.order}>
                    <div className={styles.orderHeading}>
                      <h4>{`${es ? 'Pedido' : 'Order'}: ${order.reference || (es ? 'sin referencia' : 'no reference')}`}</h4>
                      {order.pickupOn && (
                        <span>{`${es ? 'Recogida' : 'Pickup'} ${pickupFormatter.format(new Date(`${order.pickupOn}T12:00:00Z`))}`}</span>
                      )}
                    </div>
                    <div className={styles.orderDetails}>
                      <p>
                        {order.products.length > 0
                          ? order.products.map((product) => (
                            `${product.name} · ${countLabel(product.batchCount ?? 0, product.batchCount === null, es)}`
                          )).join(' / ')
                          : missingProductsLabel}
                      </p>
                      <p>{`${es ? 'Total del pedido' : 'Order total'}: ${countLabel(order.totalBatchCount ?? 0, order.totalBatchCount === null, es)}`}</p>
                    </div>
                    {order.days.length > 0 ? (
                      <div className={styles.tableContainer}>
                        <table className={styles.dailyTable}>
                          <caption className={styles.visuallyHidden}>
                            {`${customer.name} · ${order.reference || (es ? 'Pedido' : 'Order')} · ${es ? 'Lotes diarios' : 'Daily batches'}`}
                          </caption>
                          <thead>
                            <tr>
                              <th scope="col">{es ? 'Día' : 'Day'}</th>
                              <th scope="col">{es ? 'Preparación' : 'Prep'}</th>
                              <th scope="col">{es ? 'Producción' : 'Production'}</th>
                              <th scope="col">{es ? 'Recursos' : 'Resources'}</th>
                            </tr>
                          </thead>
                          <tbody>
                            {order.days.map((day) => (
                              <tr key={day.date}>
                                <th scope="row"><time dateTime={day.date}>{formatter.format(new Date(`${day.date}T12:00:00Z`))}</time></th>
                                <td>{countLabel(day.prep, day.prepUnknown, es)}</td>
                                <td>{countLabel(day.production, day.productionUnknown, es)}</td>
                                <td>{day.resources.length > 0 ? day.resources.join(', ') : unassignedLabel}</td>
                              </tr>
                            ))}
                          </tbody>
                        </table>
                      </div>
                    ) : (
                      <p className={styles.emptyOrder}>{es ? 'Distribución diaria de lotes pendiente.' : 'Daily batch allocation pending.'}</p>
                    )}
                  </li>
                ))}
              </ul>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dashboard-empty dashboard-schedule-empty">
          <CalendarDays size={28} aria-hidden />
          <h3>{es ? 'No hay lotes programados' : 'No batches scheduled yet'}</h3>
          <p>{es ? 'Programa la preparación y producción de pedidos para ver los totales diarios.' : 'Schedule order prep and production to see daily batch totals.'}</p>
        </div>
      )}
      <Link
        className="dashboard-footer-link"
        href={scheduleStartOn && scheduleEndOn
          ? `/app/scheduling?start=${scheduleStartOn}&end=${scheduleEndOn}`
          : '/app/scheduling'}
      >
        {es ? 'Abrir programación completa' : 'Open full schedule'}
        <ArrowRight size={17} aria-hidden />
      </Link>
    </section>
  );
}
