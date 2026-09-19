'use client';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import {
  Leaf,
  Home,
  Package,
  Truck,
  MessageCircle,
  LogOut,
  ArrowUpRight,
  BookOpen,
  ClipboardList,
  CalendarDays,
  Users,
  ShieldCheck,
  PackageCheck,
  Settings,
} from 'lucide-react';
import { signOut, setPreferredLocale } from '@/app/actions';
import { FeedbackDrawer } from './feedback';
const links = [
  { href: '/app', en: 'Home', es: 'Inicio', icon: Home, permission: 'dashboard.read' },
  {
    href: '/app/ingredients',
    en: 'Ingredients',
    es: 'Ingredientes',
    icon: Leaf,
    permission: 'master_data.read',
  },
  {
    href: '/app/suppliers',
    en: 'Suppliers',
    es: 'Proveedores',
    icon: Truck,
    permission: 'master_data.read',
  },
  {
    href: '/app/products',
    en: 'Products',
    es: 'Productos',
    icon: Package,
    permission: 'products.read',
  },
  {
    href: '/app/recipes',
    en: 'Recipes',
    es: 'Recetas',
    icon: BookOpen,
    permission: 'products.read',
  },
  {
    href: '/app/orders',
    en: 'Orders',
    es: 'Pedidos',
    icon: ClipboardList,
    permission: 'orders.read',
  },
  {
    href: '/app/planning',
    en: 'Planning',
    es: 'Planificación',
    icon: CalendarDays,
    permission: 'planning.read',
  },
  {
    href: '/app/inventory',
    en: 'Inventory',
    es: 'Inventario',
    icon: Package,
    permission: 'inventory.read',
  },
  {
    href: '/app/receiving',
    en: 'Receiving',
    es: 'Recepción',
    icon: PackageCheck,
    permission: 'inventory.read',
  },
  { href: '/app/team', en: 'Team', es: 'Equipo', icon: Users, permission: 'workforce.read' },
  {
    href: '/app/access-requests',
    en: 'Access requests',
    es: 'Solicitudes de acceso',
    icon: ShieldCheck,
    permission: 'access.manage',
  },
  {
    href: '/app/settings',
    en: 'Settings',
    es: 'Configuración',
    icon: Settings,
    permission: 'settings.manage',
  },
  {
    href: '/app/feedback',
    en: 'Feedback',
    es: 'Comentarios',
    icon: MessageCircle,
    permission: null,
  },
];
export function Shell({
  children,
  name,
  role,
  locale,
  permissions,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  locale: 'en' | 'es';
  permissions: string[];
}) {
  const path = usePathname();
  return (
    <div className="app-shell">
      <aside className="sidebar">
        <Link href="/app" className="brand">
          <Leaf size={42} />
          <strong>Salad Soulmates</strong>
          <small>
            GOOD FOOD BRINGS
            <br />
            PEOPLE TOGETHER
          </small>
        </Link>
        <nav aria-label="Main navigation">
          {links
            .filter((link) => !link.permission || permissions.includes(link.permission))
            .map(({ href, en, es, icon: Icon }) => (
              <Link
                key={href}
                href={href}
                aria-current={
                  (href === '/app' ? path === href : path.startsWith(href)) ? 'page' : undefined
                }
              >
                <Icon size={20} />
                {locale === 'es' ? es : en}
              </Link>
            ))}
        </nav>
        <div className="sidebar-foot">
          <p>
            Better ingredients.
            <br />
            <em>Brighter tomorrows.</em>
          </p>
          <span>FAMILY OWNED · FOOD WITH CARE</span>
        </div>
      </aside>
      <div className="app-main">
        <header className="topbar">
          <span className="breadcrumb">
            Operations <ArrowUpRight size={14} /> Increment 1A
          </span>
          <div className="identity">
            <form action={setPreferredLocale} className="locale-switcher">
              <label className="sr-only" htmlFor="locale">
                Language
              </label>
              <select
                id="locale"
                name="locale"
                value={locale}
                onChange={(event) => event.currentTarget.form?.requestSubmit()}
              >
                <option value="en">EN</option>
                <option value="es">ES</option>
              </select>
            </form>
            <span className="avatar">{name.slice(0, 1)}</span>
            <span>
              {name}
              <small>{role}</small>
            </span>
            <form action={signOut}>
              <button className="icon-button" aria-label="Sign out">
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <div className="staging-banner">
          INCREMENT 1A{' '}
          <span>
            {locale === 'es'
              ? 'Datos maestros activos · la ejecución de producción sigue bloqueada'
              : 'Master data is active · production execution remains gated'}
          </span>
        </div>
        <main>{children}</main>
        <footer>
          {locale === 'es'
            ? 'Alimentos sanos. Un mañana mejor.'
            : 'Wholesome food. A brighter tomorrow.'}
          <span>
            {locale === 'es'
              ? 'INGREDIENTES REALES · ALIANZAS REALES'
              : 'REAL INGREDIENTS · REAL PARTNERSHIPS'}
          </span>
        </footer>
      </div>
      <FeedbackDrawer />
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action,
}: {
  eyebrow: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <section className="page-heading">
      <div>
        <p className="eyebrow">{eyebrow}</p>
        <h1>
          {title}
          <Leaf aria-hidden size={34} />
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </section>
  );
}
