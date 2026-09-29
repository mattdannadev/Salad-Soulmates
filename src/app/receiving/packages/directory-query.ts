import { z } from 'zod';

export type PackageSearchParams = Record<string, string | string[] | undefined>;

export interface PackageDirectoryQuery {
  q: string;
  ingredient?: string;
  supplier?: string;
  status?: 'Available' | 'Hold' | 'Quarantined' | 'Expired' | 'Exhausted';
  expiry?: 'expired' | 'soon' | 'later' | 'undated';
  balance?: 'positive' | 'partial' | 'empty';
  sort: 'newest' | 'oldest' | 'ingredient' | 'expiry' | 'balance';
}

function singleValue(params: PackageSearchParams, key: string): string | undefined {
  const value = params[key];
  return typeof value === 'string' ? value : undefined;
}

/** Ignore malformed or repeated URL values independently so valid filters remain useful. */
export function parsePackageDirectoryQuery(params: PackageSearchParams): PackageDirectoryQuery {
  return {
    q: z.string().trim().max(200).catch('')
      .parse(singleValue(params, 'q')),
    ingredient: z.uuid().optional().catch(undefined).parse(singleValue(params, 'ingredient')),
    supplier: z.uuid().optional().catch(undefined).parse(singleValue(params, 'supplier')),
    status: z.enum(['Available', 'Hold', 'Quarantined', 'Expired', 'Exhausted'])
      .optional().catch(undefined).parse(singleValue(params, 'status')),
    expiry: z.enum(['expired', 'soon', 'later', 'undated'])
      .optional().catch(undefined).parse(singleValue(params, 'expiry')),
    balance: z.enum(['positive', 'partial', 'empty'])
      .optional().catch(undefined).parse(singleValue(params, 'balance')),
    sort: z.enum(['newest', 'oldest', 'ingredient', 'expiry', 'balance'])
      .catch('newest').parse(singleValue(params, 'sort')),
  };
}

export function hasPackageDirectoryCriteria(query: PackageDirectoryQuery): boolean {
  return Boolean(query.q || query.ingredient || query.supplier || query.status
    || query.expiry || query.balance || query.sort !== 'newest');
}

export function packageDirectoryHref(query: PackageDirectoryQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.ingredient) params.set('ingredient', query.ingredient);
  if (query.supplier) params.set('supplier', query.supplier);
  if (query.status) params.set('status', query.status);
  if (query.expiry) params.set('expiry', query.expiry);
  if (query.balance) params.set('balance', query.balance);
  if (query.sort !== 'newest') params.set('sort', query.sort);
  return `/receiving/packages${params.size ? `?${params}` : ''}`;
}
