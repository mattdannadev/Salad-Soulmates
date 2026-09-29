import { z } from 'zod';
import type { CustomerOrder } from '@/domain/customer-orders';
import type { MaterialPlan } from '@/domain/purchasing';

export type ShippingSearchParams = Record<string, string | string[] | undefined>;

export const SHIPPING_PAGE_SIZE = 20;

export const shippingDirectorySorts = [
  { value: 'pickup-oldest', label: 'Earliest pickup' },
  { value: 'pickup-newest', label: 'Latest pickup' },
  { value: 'customer', label: 'Customer A–Z' },
] as const;

function singleValue(query: ShippingSearchParams, key: string): string | undefined {
  const value = query[key];
  return typeof value === 'string' ? value : undefined;
}

/** Directory keys are separate from the order deep-link key. */
export function parseShippingDirectoryQuery(
  query: ShippingSearchParams,
  customerIds: readonly string[],
  pickupDates: readonly string[],
) {
  const rawCustomer = z.uuid().optional().catch(undefined)
    .parse(singleValue(query, 'customerFilter'));
  const rawPickup = z.iso.date().optional().catch(undefined)
    .parse(singleValue(query, 'pickup'));
  const rawPage = singleValue(query, 'page');
  return {
    q: z.string().trim().max(200).catch('')
      .parse(singleValue(query, 'q')),
    customerFilter: rawCustomer && customerIds.includes(rawCustomer) ? rawCustomer : undefined,
    pickup: rawPickup && pickupDates.includes(rawPickup) ? rawPickup : undefined,
    status: z.enum(['active', 'inactive']).optional().catch(undefined)
      .parse(singleValue(query, 'status')),
    sort: z.enum(['pickup-oldest', 'pickup-newest', 'customer']).catch('pickup-oldest')
      .parse(singleValue(query, 'sort')),
    page: rawPage && /^[1-9]\d*$/.test(rawPage)
      ? z.coerce.number().int().min(1).max(1_000_000)
        .catch(1)
        .parse(rawPage) : 1,
  };
}

export type ShippingDirectoryQuery = ReturnType<typeof parseShippingDirectoryQuery>;

export function shippingDirectoryHref(query: ShippingDirectoryQuery): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.customerFilter) params.set('customerFilter', query.customerFilter);
  if (query.pickup) params.set('pickup', query.pickup);
  if (query.status) params.set('status', query.status);
  if (query.sort !== 'pickup-oldest') params.set('sort', query.sort);
  if (query.page > 1) params.set('page', String(query.page));
  return `/app/shipping${params.size ? `?${params}` : ''}`;
}

export function shippingOrderHref(directoryHref: string, orderId: string): string {
  const url = new URL(directoryHref, 'https://internal.invalid');
  url.searchParams.set('order', orderId);
  return `${url.pathname}${url.search}`;
}

export function selectShippingOrders(
  orders: readonly CustomerOrder[],
  plans: readonly MaterialPlan[],
  query: ShippingDirectoryQuery,
  locale: 'en' | 'es',
): CustomerOrder[] {
  const statusById = new Map(plans.map((plan) => [plan.id, plan.status]));
  const search = query.q.toLocaleLowerCase(locale);
  return orders
    .filter((order) => !query.customerFilter || order.customer_id === query.customerFilter)
    .filter((order) => !query.pickup || order.needed_on === query.pickup)
    .filter((order) => !query.status
      || (statusById.get(order.id) === 'Active') === (query.status === 'active'))
    .filter((order) => !search || [order.customer_name, order.reference, order.needed_on,
      ...order.items.map((item) => item.product_name)]
      .some((value) => value.toLocaleLowerCase(locale).includes(search)))
    .toSorted((left, right) => {
      if (query.sort === 'customer') {
        return left.customer_name.localeCompare(right.customer_name, locale)
          || left.needed_on.localeCompare(right.needed_on)
          || left.id.localeCompare(right.id);
      }
      const byDate = left.needed_on.localeCompare(right.needed_on);
      return (query.sort === 'pickup-newest' ? -byDate : byDate)
        || left.id.localeCompare(right.id);
    });
}
