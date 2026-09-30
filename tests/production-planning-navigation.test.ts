import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { Shell } from '../src/components/shell';

const mocks = vi.hoisted(() => ({ pathname: '/app', push: vi.fn() }));

vi.mock('next/navigation', () => ({
  usePathname: () => mocks.pathname,
  useRouter: () => ({ push: mocks.push }),
}));
vi.mock('../src/app/actions', () => ({ signOut: vi.fn() }));
vi.mock('../src/components/feedback', () => ({ default: () => null }));
vi.mock('../src/components/locale-switcher', () => ({ default: () => null }));

function renderNavigation(locale: 'en' | 'es', permissions: string[]) {
  const props = {
    name: 'Production User',
    role: 'admin',
    locale,
    permissions,
    children: createElement('p', null, 'Content'),
  };
  return renderToStaticMarkup(createElement(Shell, props));
}

describe('Inventory navigation', () => {
  beforeEach(() => {
    mocks.pathname = '/app';
  });

  it('groups planning destinations without exposing the worker workspace', () => {
    const html = renderNavigation('en', ['production.mobile', 'orders.read']);
    expect(html).toContain('Customers &amp; orders');
    expect(html).not.toContain('href="/worker"');
    expect(html).not.toContain('Spice preparations');
    expect(html.match(/href="\/app\/orders"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/app/planning"');
  });

  it('keeps orders visible without production permission', () => {
    const html = renderNavigation('en', ['orders.read']);
    expect(html).toContain('Customers &amp; orders');
    expect(html).toContain('href="/app/orders"');
    expect(html).not.toContain('href="/worker"');
  });

  it('provides the planning destination when planning permission is present', () => {
    const html = renderNavigation('es', ['planning.read']);
    expect(html).toContain('Planificación de producción');
    expect(html).toContain('href="/app/planning"');
    expect(html).not.toContain('Preparaciones de especias');
  });
});
