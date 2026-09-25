import Link from 'next/link';
import { ArrowUpRight } from 'lucide-react';
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
    <nav className={styles.actions} aria-label={es ? 'Acciones rápidas' : 'Quick actions'}>
      {quickActions(es).map((action) => (
        <Link
          className={`button ${styles.action}`}
          href={action.href}
          key={action.href}
        >
          {action.label}
          <ArrowUpRight size={16} aria-hidden="true" />
        </Link>
      ))}
    </nav>
  );
}
