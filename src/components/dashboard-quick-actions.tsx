import Link from 'next/link';
import { ArrowUpRight, ChevronDown, Plus } from 'lucide-react';
import styles from './dashboard-quick-actions.module.css';

interface DashboardQuickActionsProps {
  es: boolean;
}

const quickActions = (es: boolean) => [
  {
    href: '/app/orders#new-order',
    label: es ? '+ Nuevo pedido' : '+ New order',
  },
  {
    href: '/app/receiving',
    label: es ? 'Registrar recepción' : 'Receive a delivery',
  },
  {
    href: '/app/recipes',
    label: es ? 'Gestionar recetas' : 'Manage recipes',
  },
  {
    href: '/app/inventory',
    label: es ? 'Gestionar inventario' : 'Manage inventory',
  },
];

export default function DashboardQuickActions({ es }: DashboardQuickActionsProps) {
  return (
    <details className={styles.menu}>
      <summary className={styles.trigger}>
        <Plus size={17} aria-hidden="true" />
        <span>{es ? 'Añadir o gestionar' : 'Add or manage'}</span>
        <ChevronDown className={styles.chevron} size={15} aria-hidden="true" />
      </summary>
      <nav className={styles.actions} aria-label={es ? 'Acciones rápidas' : 'Quick actions'}>
        {quickActions(es).map((action) => (
          <Link className={styles.action} href={action.href} key={action.href}>
            <span>{action.label}</span>
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        ))}
      </nav>
    </details>
  );
}
