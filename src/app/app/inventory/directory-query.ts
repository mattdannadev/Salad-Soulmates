import { z } from 'zod';

export type InventorySearchParams = Record<string, string | string[] | undefined>;

export const inventoryDirectoryFilters = [
  {
    key: 'type',
    label: 'Ingredient type',
    options: [
      { value: 'dry', label: 'Dry' },
      { value: 'wet', label: 'Wet' },
    ],
  },
  {
    key: 'status',
    label: 'Availability',
    options: [
      { value: 'active', label: 'Active' },
      { value: 'inactive', label: 'Inactive' },
      { value: 'all', label: 'Active and inactive' },
    ],
  },
  {
    key: 'stock',
    label: 'Reorder point',
    options: [
      { value: 'reorder', label: 'At or below' },
      { value: 'above', label: 'Above' },
      { value: 'unset', label: 'Not set' },
    ],
  },
] as const;

export const inventoryDirectorySorts = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'stock', label: 'Lowest on hand first' },
] as const;

function singleValue(query: InventorySearchParams, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

/** Inventory criteria are single valued and allowlisted before use. */
export function parseInventoryDirectoryQuery(query: InventorySearchParams) {
  const rawPage = singleValue(query, 'page');
  return {
    q: z.string().trim().max(120).catch('')
      .parse(singleValue(query, 'q')),
    type: z.enum(['dry', 'wet']).optional().catch(undefined).parse(singleValue(query, 'type')),
    status: z.enum(['active', 'inactive', 'all']).catch('active')
      .parse(singleValue(query, 'status')),
    stock: z.enum(['reorder', 'above', 'unset']).optional().catch(undefined)
      .parse(singleValue(query, 'stock')),
    sort: z.enum(['name', 'name-desc', 'stock']).catch('name')
      .parse(singleValue(query, 'sort')),
    page: rawPage && /^[1-9]\d*$/.test(rawPage)
      ? z.coerce.number().int().min(1).max(1_000_000)
        .catch(1)
        .parse(rawPage) : 1,
  };
}

type InventoryQuery = ReturnType<typeof parseInventoryDirectoryQuery>;

interface InventoryIngredient {
  id: string;
  name: string;
  category: string;
  active: boolean;
  reorder_point: number | null;
}

/** Filter the ingredient catalog with ledger derived balances; unset thresholds stay distinct. */
export function selectInventoryIngredients<T extends InventoryIngredient>(
  ingredients: readonly T[],
  balances: Record<string, number>,
  query: InventoryQuery,
  locale: 'en' | 'es',
): T[] {
  const search = query.q.toLocaleLowerCase(locale);
  return ingredients
    .filter((ingredient) => ingredient.name.toLocaleLowerCase(locale).includes(search))
    .filter((ingredient) => query.status === 'all'
      || ingredient.active === (query.status === 'active'))
    .filter((ingredient) => !query.type || (query.type === 'dry'
      ? ingredient.category === 'Dry' : ingredient.category === 'Liquid'))
    .filter((ingredient) => {
      if (!query.stock) return true;
      if (query.stock === 'unset') return ingredient.reorder_point === null;
      if (ingredient.reorder_point === null) return false;
      const isAtOrBelow = (balances[ingredient.id] ?? 0) <= ingredient.reorder_point;
      return query.stock === 'reorder' ? isAtOrBelow : !isAtOrBelow;
    })
    .sort((left, right) => {
      if (query.sort === 'stock') {
        const stockOrder = (balances[left.id] ?? 0) - (balances[right.id] ?? 0);
        if (stockOrder !== 0) return stockOrder;
      }
      const nameOrder = left.name.localeCompare(right.name, locale);
      return query.sort === 'name-desc' ? -nameOrder : nameOrder;
    });
}
