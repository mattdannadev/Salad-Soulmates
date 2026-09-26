import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { Shell } from '../src/components/shell';

const mocks = vi.hoisted(() => ({ pathname: '/app' }));

vi.mock('next/navigation', () => ({ usePathname: () => mocks.pathname }));
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

describe('Production Planning navigation', () => {
  beforeEach(() => {
    mocks.pathname = '/app';
  });

  it('exposes the worker workspace to permitted staff without duplicating Orders', () => {
    const html = renderNavigation('en', ['production.mobile', 'orders.read']);
    expect(html).toContain('Production Planning');
    expect(html).toContain('href="/worker"');
    expect(html).toContain('Spice preparations');
    expect(html.match(/href="\/app\/orders"/g)).toHaveLength(2);
    expect(html).not.toContain('href="/app/planning"');
  });

  it('hides the worker destination when production permission is absent', () => {
    const html = renderNavigation('en', ['orders.read']);
    expect(html).toContain('Production Planning');
    expect(html).toContain('href="/app/orders"');
    expect(html).not.toContain('href="/worker"');
  });

  it('provides Spanish labels for the permitted destination', () => {
    const html = renderNavigation('es', ['production.mobile']);
    expect(html).toContain('Planificación de producción');
    expect(html).toContain('Preparaciones de especias');
  });
});
