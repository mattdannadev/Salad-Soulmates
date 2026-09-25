import Link from 'next/link';
import { ArrowRight, CircleCheck, type LucideIcon } from 'lucide-react';

export interface DashboardPriority {
  id: string;
  title: string;
  detail: string;
  href: string;
  icon: LucideIcon;
  urgent: boolean;
}

/** Actionable summaries use the same permission-scoped records as the dashboard. */
export default function DashboardPriorities({ items, es }: {
  items: DashboardPriority[];
  es: boolean;
}) {
  return (
    <section className="dashboard-priorities" aria-labelledby="dashboard-priorities-heading">
      <div className="dashboard-priorities-heading">
        <div>
          <p className="eyebrow">{es ? 'TU SIGUIENTE PASO' : 'YOUR NEXT STEP'}</p>
          <h2 id="dashboard-priorities-heading">{es ? 'Qué necesita atención' : 'What needs attention'}</h2>
        </div>
        <span>{es ? 'Según tus registros disponibles' : 'From your available records'}</span>
      </div>
      {items.length > 0 ? (
        <ul className="dashboard-priority-list">
          {items.map((item) => (
            <li key={item.id}>
              <Link className={`dashboard-priority ${item.urgent ? 'is-urgent' : ''}`} href={item.href}>
                <span className="dashboard-priority-icon"><item.icon size={20} aria-hidden="true" /></span>
                <span className="dashboard-priority-copy">
                  <strong>{item.title}</strong>
                  <small>{item.detail}</small>
                </span>
                <ArrowRight size={18} aria-hidden="true" />
              </Link>
            </li>
          ))}
        </ul>
      ) : (
        <div className="dashboard-priorities-clear">
          <CircleCheck size={22} aria-hidden="true" />
          <div>
            <strong>{es ? 'Sin pendientes que revisar' : 'No items to review right now'}</strong>
            <p>{es ? 'Consulta las próximas recogidas y el inventario a continuación.' : 'Keep an eye on upcoming pickups and inventory below.'}</p>
          </div>
        </div>
      )}
    </section>
  );
}
