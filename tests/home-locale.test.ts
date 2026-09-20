import { renderToStaticMarkup } from 'react-dom/server';
import {
  describe, expect, it, vi,
} from 'vitest';
import Home from '../src/app/app/page';

const mocks = vi.hoisted(() => ({ context: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('../src/lib/auth', () => ({ requireAdminShell: mocks.context }));

describe('dashboard language', () => {
  it.each([
    ['en', 'Welcome, Matt', 'Build your ingredient library', 'What comes next'],
    ['es', 'Bienvenido, Matt', 'Crea tu catálogo de ingredientes', 'Lo que sigue'],
  ])('uses the saved %s preference throughout the dashboard', async (locale, greeting, step, next) => {
    mocks.context.mockResolvedValue({
      profile: { display_name: 'Matt Danna', preferred_locale: locale },
      db: { from: () => ({ select: () => Promise.resolve({ count: 3, error: null }) }) },
    });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain(greeting);
    expect(html).toContain(step);
    expect(html).toContain(next);
  });
});
