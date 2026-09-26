'use client';

import Link from 'next/link';
import { useState } from 'react';
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
  Search,
  Users,
  ShieldCheck,
  Settings,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Menu,
  X,
  Layers3,
  ShoppingBasket,
  Building2,
  UserCog,
  History,
} from 'lucide-react';
import { signOut } from '@/app/actions';
import FeedbackDrawer from './feedback';
import LocaleSwitcher from './locale-switcher';

const navigationGroups = [
  {
    id: 'workspace',
    en: 'Workspace',
    es: 'Espacio de trabajo',
    icon: Home,
    items: [
      {
        href: '/app',
        en: 'Dashboard',
        es: 'Panel',
        icon: Home,
        permission: 'dashboard.read',
      },
    ],
  },
  {
    id: 'catalog',
    en: 'Product catalog',
    es: 'Catálogo de productos',
    icon: Layers3,
    items: [
      {
        href: '/app/ingredients',
        en: 'Ingredients',
        es: 'Ingredientes',
        icon: Leaf,
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
    ],
  },
  {
    id: 'customer-orders',
    en: 'Customer orders',
    es: 'Pedidos de clientes',
    icon: ClipboardList,
    items: [
      {
        href: '/app/customers',
        en: 'Customers',
        es: 'Clientes',
        icon: Users,
        permission: 'orders.read',
      },
      {
        href: '/app/orders',
        en: 'Orders',
        es: 'Pedidos',
        icon: ClipboardList,
        permission: 'orders.read',
      },
      {
        href: '/app/shipping',
        en: 'Shipping',
        es: 'Envíos',
        icon: Truck,
        permission: 'orders.read',
      },
    ],
  },
  {
    id: 'procurement-inventory',
    en: 'Procurement & inventory',
    es: 'Compras e inventario',
    icon: ShoppingBasket,
    items: [
      {
        href: '/app/suppliers',
        en: 'Suppliers',
        es: 'Proveedores',
        icon: Truck,
        permission: 'master_data.read',
      },
      {
        href: '/app/inventory',
        en: 'Inventory',
        es: 'Inventario',
        icon: Package,
        permission: 'inventory.read',
      },
    ],
  },
  {
    id: 'user-management',
    en: 'User Management',
    es: 'Administración de usuarios',
    icon: UserCog,
    items: [
      {
        href: '/app/user-management/users',
        en: 'Users',
        es: 'Usuarios',
        icon: Users,
        permission: 'access.manage',
      },
      {
        href: '/app/user-management/profiles',
        en: 'Profile Management',
        es: 'Administración de perfiles',
        icon: UserCog,
        permission: 'settings.manage',
      },
      {
        href: '/app/user-management/access-requests',
        en: 'Access Requests',
        es: 'Solicitudes de acceso',
        icon: ShieldCheck,
        permission: 'access.manage',
      },
      {
        href: '/app/user-management/login-history',
        en: 'Login History',
        es: 'Historial de inicio de sesión',
        icon: History,
        permission: 'audit.read',
      },
    ],
  },
  {
    id: 'organization',
    en: 'Organization',
    es: 'Organización',
    icon: Building2,
    items: [
      {
        href: '/app/team',
        en: 'Team',
        es: 'Equipo',
        icon: Users,
        permission: 'workforce.read',
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
    ],
  },
];
export function Shell({
  children,
  name,
  role,
  locale,
  permissions,
  feedbackTypes,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  locale: 'en' | 'es';
  permissions: string[];
  feedbackTypes?: { code: string; label_en: string; label_es: string }[];
}) {
  const path = usePathname();
  const [collapsed, setCollapsed] = useState(false);
  const [mobileNavigationOpen, setMobileNavigationOpen] = useState(false);
  const isSpanish = locale === 'es';
  const expandLabel = isSpanish ? 'Expandir navegación' : 'Expand navigation';
  const collapseLabel = isSpanish ? 'Contraer navegación' : 'Collapse navigation';
  const toggleLabel = collapsed ? expandLabel : collapseLabel;
  let mobileToggleLabel = isSpanish ? 'Abrir navegación' : 'Open navigation';
  if (mobileNavigationOpen) {
    mobileToggleLabel = isSpanish ? 'Cerrar navegación' : 'Close navigation';
  }
  const isCurrentPath = (href: string) => {
    if (href === '/app' || href === '/app/user-management/users') return path === href;
    return path.startsWith(href);
  };
  return (
    <div
      className={`app-shell${collapsed ? ' sidebar-collapsed' : ''}${mobileNavigationOpen ? ' mobile-navigation-open' : ''}`}
      lang={locale}
    >
      <aside className="sidebar">
        <button
          type="button"
          className="icon-button mobile-drawer-close"
          aria-label={isSpanish ? 'Cerrar navegación' : 'Close navigation'}
          onClick={() => setMobileNavigationOpen(false)}
        >
          <X size={21} aria-hidden />
        </button>
        <button
          type="button"
          className="icon-button sidebar-toggle"
          aria-label={toggleLabel}
          title={toggleLabel}
          aria-expanded={!collapsed}
          aria-controls="main-navigation"
          onClick={() => setCollapsed((value) => !value)}
        >
          {collapsed ? (
            <PanelLeftOpen size={20} aria-hidden />
          ) : (
            <PanelLeftClose size={20} aria-hidden />
          )}
        </button>
        <Link
          href="/app"
          className="brand"
          aria-label={isSpanish ? 'Salad Soulmates — Inicio' : 'Salad Soulmates — Home'}
        >
          <Leaf size={42} aria-hidden />
          <strong>Salad Soulmates</strong>
          <small>
            {isSpanish ? 'LA BUENA COMIDA' : 'GOOD FOOD BRINGS'}
            <br />
            {isSpanish ? 'NOS UNE' : 'PEOPLE TOGETHER'}
          </small>
        </Link>
        <Link
          href="/app/traceability"
          className="sidebar-action"
          aria-current={isCurrentPath('/app/traceability') ? 'page' : undefined}
          onClick={() => setMobileNavigationOpen(false)}
        >
          <Search size={20} aria-hidden />
          <span className="nav-label">{isSpanish ? 'Trazabilidad' : 'Traceability'}</span>
        </Link>
        <nav
          id="main-navigation"
          aria-label={isSpanish ? 'Navegación principal' : 'Main navigation'}
        >
          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter(
              (item) => !item.permission || permissions.includes(item.permission),
            );
            const hasCurrentPage = visibleItems.some((item) => isCurrentPath(item.href));

            if (visibleItems.length === 1 && group.id !== 'user-management') {
              const item = visibleItems[0];
              if (!item) return null;
              const {
                href, en, es, icon: Icon,
              } = item;
              const label = isSpanish ? es : en;
              return (
                <Link
                  key={href}
                  href={href}
                  aria-label={label}
                  title={label}
                  aria-current={hasCurrentPage ? 'page' : undefined}
                  onClick={() => setMobileNavigationOpen(false)}
                >
                  <Icon size={20} aria-hidden />
                  <span className="nav-label">{label}</span>
                </Link>
              );
            }

            return (
              <details key={group.id} className="nav-group" open={hasCurrentPage}>
                <summary
                  aria-label={isSpanish ? group.es : group.en}
                  title={isSpanish ? group.es : group.en}
                >
                  <group.icon className="nav-group-icon" size={18} aria-hidden />
                  <span className="nav-group-label">{isSpanish ? group.es : group.en}</span>
                  <ChevronDown size={16} aria-hidden />
                </summary>
                <div className="nav-group-links">
                  {visibleItems.map(({
                    href, en, es, icon: Icon,
                  }) => {
                    const label = isSpanish ? es : en;
                    const isCurrentPage = isCurrentPath(href);
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-label={label}
                        title={label}
                        aria-current={isCurrentPage ? 'page' : undefined}
                        onClick={() => setMobileNavigationOpen(false)}
                      >
                        <Icon size={20} aria-hidden />
                        <span className="nav-label">{label}</span>
                      </Link>
                    );
                  })}
                </div>
              </details>
            );
          })}
        </nav>
        <div className="sidebar-foot">
          <p>
            {isSpanish ? 'Mejores ingredientes.' : 'Better ingredients.'}
            <br />
            <em>{isSpanish ? 'Un mañana mejor.' : 'Brighter tomorrows.'}</em>
          </p>
          <span>
            {isSpanish
              ? 'EMPRESA FAMILIAR · ALIMENTOS CON CUIDADO'
              : 'FAMILY OWNED · FOOD WITH CARE'}
          </span>
        </div>
      </aside>
      <button
        type="button"
        className="navigation-scrim"
        aria-label={isSpanish ? 'Cerrar navegación' : 'Close navigation'}
        aria-hidden={!mobileNavigationOpen}
        tabIndex={mobileNavigationOpen ? 0 : -1}
        onClick={() => setMobileNavigationOpen(false)}
      />
      <div className="app-main">
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-navigation-toggle"
            aria-label={mobileToggleLabel}
            aria-expanded={mobileNavigationOpen}
            aria-controls="main-navigation"
            onClick={() => setMobileNavigationOpen((value) => !value)}
          >
            {mobileNavigationOpen ? <X size={21} aria-hidden /> : <Menu size={21} aria-hidden />}
          </button>
          <span className="breadcrumb">
            {isSpanish ? 'Operaciones' : 'Operations'}
            {' '}
            <ArrowUpRight size={14} />
            {' '}
            {isSpanish ? 'Etapa 1A' : 'Increment 1A'}
          </span>
          <div className="identity">
            <LocaleSwitcher key={locale} locale={locale} />
            <span className="avatar">{name.slice(0, 1)}</span>
            <span>
              {name}
              <small>{isSpanish && role === 'admin' ? 'Administrador' : role}</small>
            </span>
            <form action={signOut}>
              <button
                type="submit"
                className="icon-button"
                aria-label={isSpanish ? 'Salir' : 'Sign out'}
              >
                <LogOut size={18} />
              </button>
            </form>
          </div>
        </header>
        <div className="staging-banner">
          {isSpanish ? 'ETAPA 1A' : 'INCREMENT 1A'}
          {' '}
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
      <nav
        className="mobile-navigation"
        aria-label={isSpanish ? 'Navegación móvil' : 'Mobile navigation'}
      >
        <Link href="/app" aria-current={path === '/app' ? 'page' : undefined}>
          <Home size={20} aria-hidden />
          <span>{isSpanish ? 'Panel' : 'Dashboard'}</span>
        </Link>
        <Link
          href="/app/ingredients"
          aria-current={
            path.startsWith('/app/ingredients')
            || path.startsWith('/app/products')
            || path.startsWith('/app/recipes')
              ? 'page'
              : undefined
          }
        >
          <Layers3 size={20} aria-hidden />
          <span>{isSpanish ? 'Catálogo' : 'Catalog'}</span>
        </Link>
        <Link
          href="/app/orders"
          aria-current={
            path.startsWith('/app/customers')
            || path.startsWith('/app/orders')
            || path.startsWith('/app/shipping')
              ? 'page'
              : undefined
          }
        >
          <ClipboardList size={20} aria-hidden />
          <span>{isSpanish ? 'Pedidos' : 'Orders'}</span>
        </Link>
        <button
          type="button"
          aria-label={isSpanish ? 'Más secciones' : 'More sections'}
          aria-expanded={mobileNavigationOpen}
          aria-controls="main-navigation"
          onClick={() => setMobileNavigationOpen((value) => !value)}
        >
          <Menu size={20} aria-hidden />
          <span>{isSpanish ? 'Más' : 'More'}</span>
        </button>
      </nav>
      <FeedbackDrawer locale={locale} feedbackTypes={feedbackTypes} />
    </div>
  );
}
export function PageHeader({
  eyebrow,
  title,
  description,
  action = undefined,
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
