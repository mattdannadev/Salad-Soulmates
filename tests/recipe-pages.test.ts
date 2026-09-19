import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import Products from '../src/app/app/products/page';
import Recipes from '../src/app/app/recipes/page';
import RecipeDetails from '../src/app/app/recipes/[id]/page';
import { fixtureId, fixtureRecords } from './browser/fixture-data';

const mocks = vi.hoisted(() => ({
  context: vi.fn(), permission: vi.fn(), rows: vi.fn(), single: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('next/navigation', () => ({
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
vi.mock('../src/lib/auth', () => ({ requireAdminShell: mocks.context }));
vi.mock('../src/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('../src/lib/data', async (original) => ({
  ...await original<typeof import('../src/lib/data')>(), rows: mocks.rows,
}));

beforeEach(() => {
  vi.clearAllMocks();
  const query = { select: vi.fn(), eq: vi.fn(), maybeSingle: mocks.single };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.context.mockResolvedValue({
    db: { from: () => query }, profile: { preferred_locale: 'en' },
  });
  mocks.permission.mockResolvedValue(true);
  mocks.rows.mockImplementation((db: unknown, table: string) => (
    Promise.resolve(fixtureRecords[table] ?? [])
  ));
  mocks.single.mockResolvedValue({ data: fixtureRecords.recipes?.[0], error: null });
});
const details = (id = fixtureId(400), version?: string) => RecipeDetails({
  params: Promise.resolve({ id }), searchParams: Promise.resolve({ version }),
});

describe('recipe and product screens', () => {
  it('links products to recipes and preserves the active released version', async () => {
    const products = renderToStaticMarkup(await Products());
    expect(products).toContain('Preview Italian dressing');
    expect(products).toContain(`/app/recipes/${fixtureId(400)}`);
    const recipes = renderToStaticMarkup(await Recipes());
    expect(recipes).toContain('v1 · Released');
    expect(recipes).not.toContain('v2 · Draft');
  });
  it('renders recorded quantities, preparation notes, and version navigation', async () => {
    const html = renderToStaticMarkup(await details());
    expect(html).toContain('Preview garlic powder');
    expect(html).toContain('Synthetic training example only.');
    expect(html).toContain(`version=${fixtureId(402)}`);
    expect(html).toContain('aria-current="page"');
  });
  it('shows a selected draft without inheriting released ingredient lines', async () => {
    const html = renderToStaticMarkup(await details(fixtureId(400), fixtureId(402)));
    expect(html).toContain('Draft — not released for production.');
    expect(html).toContain('No preparation sections recorded.');
    expect(html).not.toContain('Preview garlic powder');
  });
  it('preserves Spanish labels without translating approved formulation content', async () => {
    const context: unknown = await mocks.context();
    if (!context || typeof context !== 'object') throw new Error('Missing test context');
    mocks.context.mockResolvedValue({ ...context, profile: { preferred_locale: 'es' } });
    expect(renderToStaticMarkup(await Recipes())).toContain('Recetas');
    expect(renderToStaticMarkup(await Products())).toContain('Productos');
    const html = renderToStaticMarkup(await details());
    expect(html).toContain('Historial de versiones');
    expect(html).toContain('Preview garlic powder');
  });
  it('enforces products.read before any catalog or detail queries', async () => {
    mocks.permission.mockResolvedValue(false);
    await expect(Recipes()).rejects.toThrow('REDIRECT:/app');
    await expect(Products()).rejects.toThrow('REDIRECT:/app');
    await expect(details()).rejects.toThrow('REDIRECT:/app');
    expect(mocks.rows).not.toHaveBeenCalled();
    expect(mocks.single).not.toHaveBeenCalled();
  });
  it('returns not-found for invalid, absent, and unrelated history links', async () => {
    await expect(details('invalid')).rejects.toThrow('NOT_FOUND');
    await expect(details(fixtureId(400), fixtureId(999))).rejects.toThrow('NOT_FOUND');
    mocks.single.mockResolvedValue({ data: null, error: null });
    await expect(details()).rejects.toThrow('NOT_FOUND');
  });
  it('distinguishes an empty catalog from a failed lookup', async () => {
    mocks.rows.mockResolvedValue([]);
    expect(renderToStaticMarkup(await Recipes())).toContain('No recipes yet');
    expect(renderToStaticMarkup(await Products())).toContain('No products yet');
    mocks.rows.mockRejectedValue(new Error('READ_FAILURE'));
    await expect(Recipes()).rejects.toThrow('READ_FAILURE');
    mocks.single.mockResolvedValue({ data: null, error: { code: '503' } });
    await expect(details()).rejects.toThrow('Unable to load');
  });
});
