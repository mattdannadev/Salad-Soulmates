'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
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
  PackageCheck,
  Sparkles,
  CalendarDays,
} from 'lucide-react';
import { signOut } from '@/app/actions';
import FeedbackDrawer from './feedback';
import LocaleSwitcher from './locale-switcher';
import styles from './shell-ai-launcher.module.css';
import shellStyles from './shell.module.css';

const purchasingPermissions = [
  'orders.read',
  'planning.read',
  'inventory.read',
  'products.read',
  'master_data.read',
];

const homeNavigation = [
  {
    href: '/app', en: 'Dashboard', es: 'Panel', icon: Home, permissions: ['dashboard.read'],
  },
];

const navigationGroups = [
  {
    id: 'orders-delivery',
    en: 'Orders & delivery',
    es: 'Pedidos y entregas',
    icon: ClipboardList,
    items: [
      {
        href: '/app/orders', en: 'Orders', es: 'Pedidos', icon: ClipboardList, permission: 'orders.read',
      },
      {
        href: '/app/shipping', en: 'Shipping', es: 'Envíos', icon: Truck, permission: 'orders.read',
      },
      {
        href: '/app/customers', en: 'Customers', es: 'Clientes', icon: Users, permission: 'orders.read',
      },
    ],
  },
  {
    id: 'inventory',
    en: 'Inventory',
    es: 'Inventario',
    icon: Package,
    items: [
      {
        href: '/app/inventory', en: 'Inventory', es: 'Inventario', icon: Package, permission: 'inventory.read',
      },
      {
        href: '/app/purchasing', en: 'Purchase planning', es: 'Planificación de compras', icon: ShoppingBasket, permissions: purchasingPermissions,
      },
      {
        href: '/app/receiving', en: 'Receive deliveries', es: 'Recibir entregas', icon: PackageCheck, permission: 'inventory.read',
      },
      {
        href: '/app/traceability', en: 'Traceability', es: 'Trazabilidad', icon: Search, permission: 'inventory.read',
      },
      {
        href: '/app/suppliers', en: 'Suppliers', es: 'Proveedores', icon: Truck, permission: 'master_data.read',
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
    id: 'administration',
    en: 'Administration',
    es: 'Administración',
    icon: Building2,
    items: [
      {
        href: '/app/customers', en: 'Customers', es: 'Clientes', icon: Users, permission: 'orders.read',
      },
      {
        href: '/app/suppliers', en: 'Suppliers', es: 'Proveedores', icon: Truck, permission: 'master_data.read',
      },
      {
        href: '/app/team', en: 'Team', es: 'Equipo', icon: Users, permission: 'workforce.read',
      },
      {
        href: '/app/scheduling', en: 'Schedule', es: 'Calendario', icon: CalendarDays, permission: 'workforce.read',
      },
      {
        href: '/app/settings', en: 'Settings', es: 'Configuración', icon: Settings, permission: 'settings.manage',
      },
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
      {
        href: '/app/administration-copilot',
        en: 'Administration Copilot',
        es: 'Copiloto de administración',
        icon: Sparkles,
        permission: 'access.manage',
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
  feedbackTypes = [],
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
  const drawerRef = useRef<HTMLElement>(null);
  const mobileCloseRef = useRef<HTMLButtonElement>(null);
  const mobileTriggerRef = useRef<HTMLButtonElement>(null);
  const isSpanish = locale === 'es';
  const expandLabel = isSpanish ? 'Expandir navegación' : 'Expand navigation';
  const collapseLabel = isSpanish ? 'Contraer navegación' : 'Collapse navigation';
  const toggleLabel = collapsed ? expandLabel : collapseLabel;
  let mobileToggleLabel = isSpanish ? 'Abrir navegación' : 'Open navigation';
  if (mobileNavigationOpen) {
    mobileToggleLabel = isSpanish ? 'Cerrar navegación' : 'Close navigation';
  }
  const drawerLabel = isSpanish ? 'Navegación principal' : 'Main navigation';
  const isCurrentPath = (href: string) => (
    path === href || (href !== '/app' && path.startsWith(`${href}/`))
  );
  const closeMobileNavigation = (restoreFocus = true) => {
    setMobileNavigationOpen(false);
    if (restoreFocus) {
      requestAnimationFrame(() => mobileTriggerRef.current?.focus());
    }
  };
  const toggleMobileNavigation = (trigger: HTMLButtonElement) => {
    mobileTriggerRef.current = trigger;
    if (mobileNavigationOpen) closeMobileNavigation();
    else setMobileNavigationOpen(true);
  };
  useEffect(() => {
    if (!mobileNavigationOpen) return undefined;
    mobileCloseRef.current?.focus();
    const handleDrawerKeyDown = (event: globalThis.KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        closeMobileNavigation();
        return;
      }
      if (event.key !== 'Tab' || !drawerRef.current) return;
      const focusable = Array.from(drawerRef.current.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
      )).filter((element) => element.getClientRects().length > 0);
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (!first || !last) return;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', handleDrawerKeyDown);
    const desktopQuery = window.matchMedia('(min-width: 761px)');
    const closeOnDesktop = () => {
      if (desktopQuery.matches) setMobileNavigationOpen(false);
    };
    desktopQuery.addEventListener('change', closeOnDesktop);
    closeOnDesktop();
    return () => {
      document.removeEventListener('keydown', handleDrawerKeyDown);
      desktopQuery.removeEventListener('change', closeOnDesktop);
    };
  }, [mobileNavigationOpen]);
  const canSee = (required: string[]) => required.every(
    (permission) => permissions.includes(permission),
  );
  const canSeeItem = (item: { permission?: string | null; permissions?: string[] }) => (
    item.permissions
      ? canSee(item.permissions)
      : !item.permission || permissions.includes(item.permission)
  );
  const visibleHomeNavigation = homeNavigation.filter((item) => canSee(item.permissions));
  const mobileDestinations = [
    homeNavigation[0],
    navigationGroups[0]?.items[0],
    navigationGroups[1]?.items[0],
  ].filter((item) => item !== undefined)
    .filter(canSeeItem);
  return (
    <div
      className={`app-shell ${shellStyles.shellRoot}${collapsed ? ' sidebar-collapsed' : ''}${mobileNavigationOpen ? ' mobile-navigation-open' : ''}`}
      lang={locale}
    >
      <aside
        ref={drawerRef}
        className={`sidebar ${shellStyles.drawer}${mobileNavigationOpen ? ` ${shellStyles.drawerOpen}` : ''}`}
        role={mobileNavigationOpen ? 'dialog' : 'complementary'}
        aria-modal={mobileNavigationOpen ? true : undefined}
        aria-label={mobileNavigationOpen ? drawerLabel : undefined}
      >
        <button
          type="button"
          className="icon-button mobile-drawer-close"
          ref={mobileCloseRef}
          aria-label={isSpanish ? 'Cerrar navegación' : 'Close navigation'}
          onClick={() => closeMobileNavigation()}
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
        <nav
          id="main-navigation"
          aria-label={isSpanish ? 'Navegación principal' : 'Main navigation'}
        >
          {visibleHomeNavigation.map(({
            href, en, es, icon: Icon,
          }) => {
            const label = isSpanish ? es : en;
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                aria-current={isCurrentPath(href) ? 'page' : undefined}
                onClick={() => closeMobileNavigation(false)}
              >
                <Icon size={20} aria-hidden />
                <span className="nav-label">{label}</span>
              </Link>
            );
          })}
          {navigationGroups.map((group) => {
            const visibleItems = group.items.filter(canSeeItem);
            const hasCurrentPage = visibleItems.some((item) => isCurrentPath(item.href)
              && !(group.id === 'administration' && ['/app/customers', '/app/suppliers'].includes(item.href)));

            if (visibleItems.length === 0) return null;

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
                    const isCurrentPage = isCurrentPath(href)
                      && !(group.id === 'administration' && ['/app/customers', '/app/suppliers'].includes(href));
                    return (
                      <Link
                        key={href}
                        href={href}
                        aria-label={label}
                        title={label}
                        aria-current={isCurrentPage ? 'page' : undefined}
                        onClick={() => closeMobileNavigation(false)}
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
        aria-hidden="true"
        tabIndex={-1}
        onClick={() => closeMobileNavigation()}
      />
      <div className="app-main" inert={mobileNavigationOpen}>
        <header className="topbar">
          <button
            type="button"
            className="icon-button mobile-navigation-toggle"
            aria-label={mobileToggleLabel}
            aria-expanded={mobileNavigationOpen}
            aria-controls="main-navigation"
            onClick={(event) => toggleMobileNavigation(event.currentTarget)}
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
            {role === 'admin' && (
              <Link
                href="/app/operations-copilot"
                className={styles.launcher}
                aria-label={isSpanish ? 'Abrir copiloto de operaciones' : 'Open Operations Copilot'}
                aria-current={path === '/app/operations-copilot' ? 'page' : undefined}
                title={isSpanish ? 'Copiloto de operaciones' : 'Operations Copilot'}
              >
                <Sparkles size={18} aria-hidden />
              </Link>
            )}
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
        className={`mobile-navigation ${shellStyles.mobileBottomNavigation}`}
        aria-label={isSpanish ? 'Navegación móvil' : 'Mobile navigation'}
        inert={mobileNavigationOpen}
      >
        {mobileDestinations.map(({
          href, en, es, icon: Icon,
        }) => (
          <Link
            key={href}
            href={href}
            aria-current={isCurrentPath(href) ? 'page' : undefined}
            onClick={() => closeMobileNavigation(false)}
          >
            <Icon size={20} aria-hidden />
            <span>{isSpanish ? es : en}</span>
          </Link>
        ))}
        <button
          type="button"
          aria-label={isSpanish ? 'Más secciones' : 'More sections'}
          aria-expanded={mobileNavigationOpen}
          aria-controls="main-navigation"
          onClick={(event) => toggleMobileNavigation(event.currentTarget)}
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
  eyebrow = undefined,
  title,
  description,
  action = undefined,
}: {
  eyebrow?: string;
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <header className="page-heading">
      <div>
        {eyebrow && <p className="eyebrow">{eyebrow}</p>}
        <h1>
          {title}
          <Leaf aria-hidden size={34} />
        </h1>
        <p>{description}</p>
      </div>
      {action}
    </header>
  );
}
