import { z } from 'zod';
import type { Recipe, RecipeVersion } from '@/domain/recipes';
import { productRowSchema, selectRecipeVersion } from '@/domain/recipes';

type Product = z.infer<typeof productRowSchema>;

export type RecipeSearchParams = Record<string, string | string[] | undefined>;

export const recipeDirectoryFilters = [
  {
    key: 'status',
    label: 'Displayed version',
    options: [
      { value: 'Draft', label: 'Draft' },
      { value: 'Released', label: 'Released' },
      { value: 'Retired', label: 'Retired' },
      { value: 'none', label: 'No versions' },
    ],
  },
  {
    key: 'released',
    label: 'Released version',
    options: [
      { value: 'yes', label: 'Available' },
      { value: 'no', label: 'Missing' },
    ],
  },
] as const;

export const recipeDirectorySorts = [
  { value: 'name', label: 'Recipe A–Z' },
  { value: 'name-desc', label: 'Recipe Z–A' },
  { value: 'product', label: 'Product A–Z' },
  { value: 'version-desc', label: 'Newest version first' },
] as const;

const searchSchema = z.string().trim().max(200).catch('');
const pageSchema = z.coerce.number().int().min(1).max(1_000_000)
  .catch(1);

function singleValue(query: RecipeSearchParams, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

export function parseRecipeDirectoryQuery(query: RecipeSearchParams) {
  const q = searchSchema.parse(singleValue(query, 'q'));
  const status = z.enum(['Draft', 'Released', 'Retired', 'none']).optional().catch(undefined)
    .parse(singleValue(query, 'status'));
  const released = z.enum(['yes', 'no']).optional().catch(undefined)
    .parse(singleValue(query, 'released'));
  const sort = z.enum(['name', 'name-desc', 'product', 'version-desc']).catch('name')
    .parse(singleValue(query, 'sort'));
  const rawPage = singleValue(query, 'page');
  const page = rawPage && /^[1-9]\d*$/.test(rawPage) ? pageSchema.parse(rawPage) : 1;
  return {
    q, status, released, sort, page,
  };
}

export function recipeDirectoryHref(query: RecipeSearchParams): string {
  const parsed = parseRecipeDirectoryQuery(query);
  const params = new URLSearchParams();
  if (parsed.q) params.set('q', parsed.q);
  if (parsed.status) params.set('status', parsed.status);
  if (parsed.released) params.set('released', parsed.released);
  if (typeof query.sort === 'string' && parsed.sort === query.sort) params.set('sort', parsed.sort);
  if (parsed.page > 1) params.set('page', String(parsed.page));
  return `/app/recipes${params.size ? `?${params}` : ''}`;
}

export interface RecipeDirectoryRow {
  recipe: Recipe;
  product: Product | undefined;
  version: RecipeVersion | null;
  hasReleasedVersion: boolean;
}

export function recipeDirectoryRows(
  recipes: readonly Recipe[],
  products: readonly Product[],
  versions: readonly RecipeVersion[],
  query: ReturnType<typeof parseRecipeDirectoryQuery>,
  locale: 'en' | 'es',
): RecipeDirectoryRow[] {
  const productById = new Map(products.map((product) => [product.id, product]));
  const search = query.q.toLocaleLowerCase(locale);
  return recipes.map((recipe) => ({
    recipe,
    product: productById.get(recipe.product_id),
    version: selectRecipeVersion(recipe, versions),
    hasReleasedVersion: versions.some((version) => version.recipe_id === recipe.id
      && version.status === 'Released'),
  })).filter(({
    recipe, product, version, hasReleasedVersion,
  }) => {
    if (search && ![recipe.name, product?.name]
      .some((value) => value?.toLocaleLowerCase(locale).includes(search))) return false;
    if (query.status && (version?.status ?? 'none') !== query.status) return false;
    if (query.released && hasReleasedVersion !== (query.released === 'yes')) return false;
    return true;
  }).sort((left, right) => {
    let order = 0;
    if (query.sort === 'product') {
      order = (left.product?.name ?? '').localeCompare(right.product?.name ?? '', locale);
    } else if (query.sort === 'version-desc') {
      order = (right.version?.version_number ?? 0) - (left.version?.version_number ?? 0);
    }
    if (order) return order;
    const nameOrder = left.recipe.name.localeCompare(right.recipe.name, locale);
    if (nameOrder) return query.sort === 'name-desc' ? -nameOrder : nameOrder;
    return left.recipe.id.localeCompare(right.recipe.id);
  });
}

export function recipePageForRow(ids: readonly string[], id: string, pageSize: number) {
  const index = ids.indexOf(id);
  return index < 0 ? undefined : Math.floor(index / pageSize) + 1;
}
