import { z } from 'zod';

export type ProductSearchParams = Record<string, string | string[] | undefined>;

export const PRODUCT_PAGE_SIZE = 20;

export const productDirectoryFilters = [
  { key: 'status', label: 'Status', options: [{ value: 'active', label: 'Active' }, { value: 'inactive', label: 'Inactive' }] },
  { key: 'recipe', label: 'Released recipe', options: [{ value: 'released', label: 'Released' }, { value: 'missing', label: 'No released recipe' }] },
  { key: 'packaging', label: 'Approved packaging', options: [{ value: 'approved', label: 'Approved' }, { value: 'missing', label: 'No approval' }] },
  { key: 'pricing', label: 'Customer pricing', options: [{ value: 'configured', label: 'Configured' }, { value: 'missing', label: 'No active options' }] },
] as const;

export const productDirectorySorts = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'batch', label: 'Largest standard batch' },
] as const;

function singleValue(query: ProductSearchParams, key: string): string | undefined {
  return typeof query[key] === 'string' ? query[key] : undefined;
}

/** URL criteria are descriptive of stored records; they never imply sellability. */
export function parseProductDirectoryQuery(query: ProductSearchParams) {
  const q = z.string().trim().max(200).catch('')
    .parse(singleValue(query, 'q'));
  const status = z.enum(['active', 'inactive']).optional().catch(undefined)
    .parse(singleValue(query, 'status'));
  const recipe = z.enum(['released', 'missing']).optional().catch(undefined)
    .parse(singleValue(query, 'recipe'));
  const packaging = z.enum(['approved', 'missing']).optional().catch(undefined)
    .parse(singleValue(query, 'packaging'));
  const pricing = z.enum(['configured', 'missing']).optional().catch(undefined)
    .parse(singleValue(query, 'pricing'));
  const sort = z.enum(['name', 'name-desc', 'batch']).catch('name')
    .parse(singleValue(query, 'sort'));
  const rawPage = singleValue(query, 'page');
  const page = rawPage && /^[1-9]\d*$/.test(rawPage)
    ? z.coerce.number().int().min(1).max(1_000_000)
      .catch(1)
      .parse(rawPage) : 1;
  return {
    q, status, recipe, packaging, pricing, sort, page,
  };
}

export type ProductDirectoryQuery = ReturnType<typeof parseProductDirectoryQuery>;

/** Canonical state for navigation and recovery links. */
export function productDirectoryHref(query: ProductDirectoryQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.status) params.set('status', query.status);
  if (query.recipe) params.set('recipe', query.recipe);
  if (query.packaging) params.set('packaging', query.packaging);
  if (query.pricing) params.set('pricing', query.pricing);
  if (query.sort !== 'name') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return `/app/products${params.size ? `?${params}` : ''}`;
}

export interface ProductDirectoryRecord {
  id: string;
  name: string;
  productCode: string | null;
  active: boolean;
  batchGallons: number;
  hasReleasedRecipe: boolean;
  hasApprovedPackaging: boolean;
  hasActivePricing: boolean;
}

/** Filter only organization-scoped records already returned by the authorized catalog loader. */
export function selectProductDirectory(
  records: readonly ProductDirectoryRecord[],
  query: ProductDirectoryQuery,
  locale: 'en' | 'es',
): ProductDirectoryRecord[] {
  const search = query.q.toLocaleLowerCase(locale);
  return records
    .filter((record) => !search || [record.name, record.productCode ?? '']
      .some((value) => value.toLocaleLowerCase(locale).includes(search)))
    .filter((record) => !query.status || record.active === (query.status === 'active'))
    .filter((record) => !query.recipe || record.hasReleasedRecipe === (query.recipe === 'released'))
    .filter((record) => !query.packaging || record.hasApprovedPackaging === (query.packaging === 'approved'))
    .filter((record) => !query.pricing || record.hasActivePricing === (query.pricing === 'configured'))
    .sort((left, right) => {
      if (query.sort === 'batch') {
        const batchOrder = right.batchGallons - left.batchGallons;
        if (batchOrder !== 0) return batchOrder;
      }
      const nameOrder = left.name.localeCompare(right.name, locale);
      return (query.sort === 'name-desc' ? -nameOrder : nameOrder)
        || left.id.localeCompare(right.id);
    });
}
