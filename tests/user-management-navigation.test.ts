import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { Shell } from '../src/components/shell';

const mocks = vi.hoisted(() => ({ pathname: '/app', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('../src/app/actions', () => ({ signOut: vi.fn() }));
vi.mock('../src/components/feedback', () => ({ default: () => null }));
vi.mock('../src/components/locale-switcher', () => ({ default: () => null }));

describe('User Management navigation', () => {
  beforeEach(() => {
    mocks.pathname = '/app';
  });

  it('groups all four administration screens and marks only the selected child current', () => {
    mocks.pathname = '/app/user-management/profiles';
    const props = {
      name: 'Admin User',
      role: 'admin',
      locale: 'en' as const,
      permissions: ['access.manage', 'settings.manage', 'audit.read'],
      children: createElement('p', null, 'Content'),
    };
    const html = renderToStaticMarkup(createElement(Shell, props));
    expect(html).toContain('Administration');
    expect(html).toContain('href="/app/user-management/users"');
    expect(html).toContain('href="/app/user-management/profiles"');
    expect(html).toContain('href="/app/user-management/access-requests"');
    expect(html).toContain('href="/app/user-management/login-history"');
    expect(html.match(/<a[^>]*href="\/app\/user-management\/profiles"[^>]*>/)?.[0])
      .toContain('aria-current="page"');
    expect(html).not.toMatch(/href="\/app\/user-management\/users"[^>]*aria-current="page"/);
    expect(html).not.toContain('href="/app/access-requests"');
  });

  it('keeps the section visibly grouped when permission filtering leaves one Spanish item', () => {
    const props = {
      name: 'Auditora',
      role: 'reviewer',
      locale: 'es' as const,
      permissions: ['audit.read'],
      children: createElement('p', null, 'Contenido'),
    };
    const html = renderToStaticMarkup(createElement(Shell, props));
    expect(html).toContain('<details class="nav-section nav-group"');
    expect(html).toContain('open=""');
    expect(html).toContain('Administración');
    expect(html).toContain('Historial de inicio de sesión');
    expect(html).not.toContain('Administración de perfiles');
  });

  it('marks one matching desktop link current on a customer detail route', () => {
    mocks.pathname = '/app/customers/123';
    const props = {
      name: 'Admin User',
      role: 'admin',
      locale: 'en' as const,
      permissions: ['orders.read'],
      children: createElement('p', null, 'Content'),
    };
    const html = renderToStaticMarkup(createElement(Shell, props));
    const desktopNavigation = html.match(/<nav id="main-navigation"[\s\S]*?<\/nav>/)?.[0] ?? '';
    expect(desktopNavigation.match(/aria-current="page"/g)).toHaveLength(1);
    expect(desktopNavigation).toMatch(/aria-current="page"[^>]*href="\/app\/customers"/);
  });
});
