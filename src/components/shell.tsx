'use client';

import Link from 'next/link';
import { Fragment, useEffect, useRef, useState } from 'react';
import { usePathname } from 'next/navigation';
import {
  Leaf,
  LogOut,
  PanelLeftClose,
  PanelLeftOpen,
  ChevronDown,
  Menu,
  X,
  Sparkles,
} from 'lucide-react';
import { signOut } from '@/app/actions';
import FeedbackDrawer from './feedback';
import LocaleSwitcher from './locale-switcher';
import styles from './shell-ai-launcher.module.css';
import shellStyles from './shell.module.css';
import CommandPalette from './command-palette';
import {
  getMobileNavigationDestinations,
  getNavigationBreadcrumb,
  getVisibleNavigationDestinations,
  getVisibleSectionDestinations,
  isNavigationDestinationCurrent,
  isNavigationSectionCurrent,
  navigationLabel,
  navigationSections,
} from './navigation-registry';
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
      const focusable = Array.from(
        drawerRef.current.querySelectorAll<HTMLElement>(
          'a[href], button:not([disabled]), summary, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter(
        (element) =>
          element.getClientRects().length > 0 &&
          (element.tagName === 'SUMMARY' || !element.closest('details:not([open])')),
      );
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
  const visibleHomeNavigation = getVisibleNavigationDestinations(permissions).filter(
    (item) => item.itemType === 'home',
  );
  const mobileDestinations = getMobileNavigationDestinations(permissions);
  const breadcrumb = getNavigationBreadcrumb(path, locale);
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
          {visibleHomeNavigation.map(({ href, en, es, icon: Icon }) => {
            const label = isSpanish ? es : en;
            return (
              <Link
                key={href}
                href={href}
                aria-label={label}
                title={label}
                aria-current={isNavigationDestinationCurrent({ href }, path) ? 'page' : undefined}
                onClick={() => closeMobileNavigation(false)}
              >
                <Icon size={20} aria-hidden />
                <span className="nav-label">{label}</span>
              </Link>
            );
          })}
          {navigationSections.map((group, index) => {
            const visibleItems = getVisibleSectionDestinations(group, permissions);
            const hasCurrentPage = isNavigationSectionCurrent(group, path, permissions);

            if (visibleItems.length === 0) return null;

            // Small sections create an unnecessary "open before you can find it" step.
            // Reserve accordion groups for three or more related destinations.
            if (visibleItems.length <= 2) {
              return (
                <Fragment key={group.id}>
                  {index > 0 && <div className="nav-group-divider" aria-hidden />}
                  {visibleItems.map(({ active, destination }) => {
                    const { href, icon: Icon } = destination;
                    const label = navigationLabel(destination, locale);
                    const isCurrentPage =
                      active !== false && isNavigationDestinationCurrent(destination, path);
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
                </Fragment>
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
                  {visibleItems.map(({ active, destination }) => {
                    const { href, icon: Icon } = destination;
                    const label = navigationLabel(destination, locale);
                    const isCurrentPage =
                      active !== false && isNavigationDestinationCurrent(destination, path);
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
          <nav className="breadcrumb" aria-label={isSpanish ? 'Ruta de navegación' : 'Breadcrumb'}>
            {breadcrumb ? (
              breadcrumb.map((item, index) => (
                <Fragment key={`${item.label}-${index}`}>
                  {index > 0 && <span aria-hidden>›</span>}
                  {item.href ? (
                    <Link href={item.href}>{item.label}</Link>
                  ) : (
                    <span aria-current={index === breadcrumb.length - 1 ? 'page' : undefined}>
                      {item.label}
                    </span>
                  )}
                </Fragment>
              ))
            ) : (
              <span>{isSpanish ? 'Operaciones' : 'Operations'}</span>
            )}
          </nav>
          <div className="identity">
            <CommandPalette locale={locale} permissions={permissions} />
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
          {isSpanish ? 'ETAPA 1A' : 'INCREMENT 1A'}{' '}
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
        {mobileDestinations.map(({ href, en, es, icon: Icon }) => (
          <Link
            key={href}
            href={href}
            aria-current={isNavigationDestinationCurrent({ href }, path) ? 'page' : undefined}
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
