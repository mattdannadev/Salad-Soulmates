import { z } from 'zod';
import { supplierReturnContext } from '@/lib/supplier-return-context';

export type SupplierSearchParams = Record<string, string | string[] | undefined>;

export const supplierDirectoryFilters = [{
  key: 'status',
  label: 'Status',
  options: [
    { value: 'active', label: 'Active' },
    { value: 'inactive', label: 'Inactive' },
  ],
}] as const;

export const supplierDirectorySorts = [
  { value: 'name', label: 'Name A–Z' },
  { value: 'name-desc', label: 'Name Z–A' },
  { value: 'open-purchases', label: 'Most open purchases' },
] as const;

const pageSchema = z.coerce.number().int().min(1).max(1_000_000)
  .catch(1);
const searchSchema = z.string().trim().max(200).catch('');

function singleValue(query: SupplierSearchParams, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

/** Parse only supported URL criteria; repeated and malformed values use defaults. */
export function parseSupplierDirectoryQuery(query: SupplierSearchParams) {
  const q = searchSchema.parse(singleValue(query, 'q'));
  const status = z.enum(['active', 'inactive']).optional().catch(undefined)
    .parse(singleValue(query, 'status'));
  const sort = z.enum(['name', 'name-desc', 'open-purchases']).catch('name')
    .parse(singleValue(query, 'sort'));
  const rawPage = singleValue(query, 'page');
  const page = rawPage && /^[1-9]\d*$/.test(rawPage) ? pageSchema.parse(rawPage) : 1;
  return {
    q, status, sort, page,
  };
}

/** Keep only supported, authorized criteria when a form returns to the directory. */
export function supplierDirectoryHref(
  query: SupplierSearchParams,
  canReadPurchases: boolean,
): string {
  const parsed = parseSupplierDirectoryQuery(query);
  const params = new URLSearchParams();
  if (parsed.q) params.set('q', parsed.q);
  if (parsed.status) params.set('status', parsed.status);
  if (parsed.sort !== 'open-purchases' || canReadPurchases) {
    if (typeof query.sort === 'string' && parsed.sort === query.sort) {
      params.set('sort', parsed.sort);
    }
  }
  if (parsed.page > 1) params.set('page', String(parsed.page));
  return `/app/suppliers${params.size ? `?${params}` : ''}`;
}

/** Preserve the setup checklist's Home continuation when opening creation. */
export function supplierCreateReturnHref(
  query: SupplierSearchParams,
  canReadPurchases: boolean,
): string {
  if (supplierReturnContext(query.returnTo, undefined).href === '/app') return '/app';
  return supplierDirectoryHref(query, canReadPurchases);
}

/** Find the URL page that can reveal a returned row under the current criteria. */
export function supplierPageForRow(
  supplierIds: readonly string[],
  supplierId: string,
  pageSize: number,
): number | undefined {
  const index = supplierIds.indexOf(supplierId);
  return index < 0 ? undefined : Math.floor(index / pageSize) + 1;
}
