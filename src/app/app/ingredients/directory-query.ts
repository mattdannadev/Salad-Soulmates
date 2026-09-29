import { z } from 'zod';

export type IngredientSearchParams = Record<string, string | string[] | undefined>;

export const ingredientDirectoryFilters = [
  {
    key: 'type',
    label: 'Type',
    options: [
      { value: 'dry', label: 'Dry' },
      { value: 'wet', label: 'Wet' },
    ],
  },
  {
    key: 'status',
    label: 'Status',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'all', label: 'Active and inactive' },
    ],
  },
  {
    key: 'stock',
    label: 'Stock',
    options: [
      { value: 'reorder', label: 'Needs reorder' },
      { value: 'ok', label: 'Stock OK' },
    ],
  },
] as const;

export const ingredientDirectorySorts = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'stock', label: 'Lowest stock first' },
] as const;

const pageSchema = z.coerce.number().int().min(1).max(1_000_000)
  .catch(1);
const searchSchema = z.string().trim().max(120).catch('');

function singleValue(query: IngredientSearchParams, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

/** Preserve the active-only default and explicit `status=all` directory view. */
export function parseIngredientDirectoryQuery(query: IngredientSearchParams) {
  const q = searchSchema.parse(singleValue(query, 'q'));
  const status = z.enum(['active', 'inactive', 'all']).catch('active')
    .parse(singleValue(query, 'status'));
  const type = z.enum(['dry', 'wet']).optional().catch(undefined)
    .parse(singleValue(query, 'type'));
  const stock = z.enum(['reorder', 'ok']).optional().catch(undefined)
    .parse(singleValue(query, 'stock'));
  const sort = z.enum(['name', 'name-desc', 'stock']).catch('name')
    .parse(singleValue(query, 'sort'));
  const rawPage = singleValue(query, 'page');
  const page = rawPage && /^[1-9]\d*$/.test(rawPage) ? pageSchema.parse(rawPage) : 1;
  return {
    q, status, type, stock, sort, page,
  };
}
