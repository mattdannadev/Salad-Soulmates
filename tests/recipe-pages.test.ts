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
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
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
    expect(products).toContain('Preview Italian recipe · v1');
    expect(products).toContain(`/app/recipes/${fixtureId(400)}?version=${fixtureId(401)}`);
    expect(products).toContain('<th>Packaging</th>');
    expect(products).toContain('Customer pricing &amp; packaging');
    expect(products).toContain('<details class="product-customer-options">');
    expect(products).toContain('<details class="product-recipe-details">');
    expect(products).toContain('Active recipe details');
    expect(products).toContain('Preview garlic powder');
    expect(products).toContain('Preview Italian recipe · v1 · 40 gal');
    const recipes = renderToStaticMarkup(await Recipes());
    expect(recipes).toContain('v1 · Released');
    expect(recipes).not.toContain('v2 · Draft');
  });
  it('keeps the recipe link usable when its active version is unavailable', async () => {
    mocks.rows.mockImplementation((db: unknown, table: string) => Promise.resolve(
      table === 'recipe_versions' ? [] : fixtureRecords[table] ?? [],
    ));
    const products = renderToStaticMarkup(await Products());
    expect(products).toContain('Preview Italian recipe');
    expect(products).not.toContain('Preview Italian recipe · v');
    expect(products).toContain(`href="/app/recipes/${fixtureId(400)}"`);
  });
  it('groups recorded ingredients by dry and liquid category without changing their quantities', async () => {
    const html = renderToStaticMarkup(await details());
    expect(html).toContain('Preview garlic powder');
    expect(html).toContain('<h3>Dry ingredients</h3>');
    expect(html).toContain('<h3>Liquid ingredients</h3>');
    expect(html.indexOf('Dry ingredients')).toBeLessThan(html.indexOf('Preview garlic powder'));
    expect(html.indexOf('Liquid ingredients')).toBeLessThan(html.indexOf('Preview lemon juice'));
    expect(html).toContain('1 lb');
    expect(html).toContain('2 gal');
    expect(html).toContain('Synthetic training example only.');
    expect(html).toContain(`version=${fixtureId(402)}`);
    expect(html).toContain('aria-current="page"');
    expect(html).toContain(`/app/ingredients/${fixtureId(100)}`);
    expect(html).not.toContain('On hand: Not recorded');
    expect(html).not.toContain('<details class="ingredient-stock">');
    expect(html).toContain('Preparation example');
  });
  it('labels imported worksheet blocks as ingredients without changing quantities', async () => {
    mocks.rows.mockImplementation((db: unknown, table: string) => Promise.resolve(
      table === 'recipe_sections'
        ? fixtureRecords.recipe_sections?.map((section) => ({ ...section, name: 'Worksheet block 1' }))
        : fixtureRecords[table] ?? [],
    ));
    const html = renderToStaticMarkup(await details());
    expect(html).toContain('<h2>Ingredients</h2>');
    expect(html).not.toContain('Worksheet block');
    expect(html).toContain('1 lb');
    expect(html).toContain('2 gal');
  });
  it.each([8, 0, -2])('shows the recorded ledger balance %s in the ingredient base unit', async (balance) => {
    mocks.rows.mockImplementation((db: unknown, table: string) => Promise.resolve(
      table === 'inventory_events'
        ? [{ ingredient_id: fixtureId(100), quantity_delta: 10 },
          { ingredient_id: fixtureId(100), quantity_delta: balance - 10 }]
        : fixtureRecords[table] ?? [],
    ));
    const html = renderToStaticMarkup(await details());
    expect(html).toContain(`On hand: ${balance} lb`);
    if (balance < 0) expect(html).toContain('Review negative balance');
  });
  it('does not read inventory when the viewer lacks inventory access', async () => {
    mocks.permission.mockImplementation((db: unknown, permission: string) => Promise.resolve(permission !== 'inventory.read'));
    const html = renderToStaticMarkup(await details());
    expect(html).toContain('Inventory details unavailable with your access');
    expect(html).toContain(`/app/ingredients/${fixtureId(100)}`);
    expect(mocks.rows.mock.calls.some((call) => call[1] === 'inventory_events')).toBe(false);
  });
  it('does not invent links for hidden ingredients or turn failed stock reads into zero', async () => {
    mocks.rows.mockImplementation((db: unknown, table: string) => Promise.resolve(
      table === 'ingredients' ? [] : fixtureRecords[table] ?? [],
    ));
    const html = renderToStaticMarkup(await details());
    expect(html).toContain('Ingredient details unavailable with your access');
    expect(html).not.toContain(`/app/ingredients/${fixtureId(100)}`);
    mocks.rows.mockImplementation((db: unknown, table: string) => (
      table === 'inventory_events'
        ? Promise.reject(new Error('STOCK_READ_FAILED'))
        : Promise.resolve(fixtureRecords[table] ?? [])
    ));
    await expect(details()).rejects.toThrow('STOCK_READ_FAILED');
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
