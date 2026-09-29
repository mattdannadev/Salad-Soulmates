import { z } from 'zod';

export type OrderSearchParams = Record<string, string | string[] | undefined>;

export const ORDER_PAGE_SIZE = 20;

export const orderDirectorySorts = [
  { value: 'pickup-newest', label: 'Newest pickup' },
  { value: 'pickup-oldest', label: 'Oldest pickup' },
  { value: 'customer-desc', label: 'Customer Z–A' },
] as const;

function singleValue(query: OrderSearchParams, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

function isoDate(query: OrderSearchParams, key: string): string | undefined {
  const value = singleValue(query, key);
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(Date.parse(`${value}T00:00:00Z`))
    ? value : undefined;
}

/** Accept only known directory criteria. The draft customer key remains separate. */
export function parseOrderDirectoryQuery(
  query: OrderSearchParams,
  customerIds: readonly string[],
  productNames: readonly string[],
) {
  const q = z.string().trim().max(200).catch('')
    .parse(singleValue(query, 'q'));
  const customerFilter = z
    .uuid()
    .optional()
    .catch(undefined)
    .parse(singleValue(query, 'customerFilter'));
  const product = z.string().trim().max(120).catch('')
    .parse(singleValue(query, 'product'));
  const status = z
    .enum(['unplanned', 'draft', 'confirmed'])
    .optional()
    .catch(undefined)
    .parse(singleValue(query, 'status'));
  const view = z.enum(['historical']).optional().catch(undefined).parse(singleValue(query, 'view'));
  const sort = z
    .enum(['pickup-newest', 'pickup-oldest', 'customer-desc'])
    .catch('pickup-newest')
    .parse(singleValue(query, 'sort'));
  const rawPage = singleValue(query, 'page');
  const page = rawPage && /^[1-9]\d*$/.test(rawPage)
    ? z.coerce.number().int().min(1).max(1_000_000)
      .catch(1)
      .parse(rawPage)
    : 1;
  const pickupFrom = isoDate(query, 'pickupFrom');
  const pickupTo = isoDate(query, 'pickupTo');
  return {
    q,
    customerFilter:
      customerFilter && customerIds.includes(customerFilter) ? customerFilter : undefined,
    product: productNames.includes(product) ? product : undefined,
    status,
    view,
    sort,
    page,
    pickupFrom: pickupFrom && (!pickupTo || pickupFrom <= pickupTo) ? pickupFrom : undefined,
    pickupTo: pickupTo && (!pickupFrom || pickupFrom <= pickupTo) ? pickupTo : undefined,
  };
}

/** Canonical directory URL for details, draft resume, and clear-all recovery. */
export function orderDirectoryHref(query: ReturnType<typeof parseOrderDirectoryQuery>): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.customerFilter) params.set('customerFilter', query.customerFilter);
  if (query.product) params.set('product', query.product);
  if (query.status) params.set('status', query.status);
  if (query.view) params.set('view', query.view);
  if (query.sort !== 'pickup-newest') params.set('sort', query.sort);
  if (query.pickupFrom) params.set('pickupFrom', query.pickupFrom);
  if (query.pickupTo) params.set('pickupTo', query.pickupTo);
  if (query.page > 1) params.set('page', String(query.page));
  return `/app/orders${params.size ? `?${params}` : ''}`;
}

export function orderDetailHref(directoryHref: string, orderId: string): string {
  const url = new URL(directoryHref, 'https://internal.invalid');
  url.searchParams.set('order', orderId);
  return `${url.pathname}${url.search}`;
}
