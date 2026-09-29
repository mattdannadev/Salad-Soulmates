import type { Customer } from '@/domain/customer-pricing';
import type { CustomerOrder } from '@/domain/customer-orders';
import type { DirectoryQueryConfig } from '@/components/directory-toolbar';

const PAGE_SIZE = 20;
const MAX_SEARCH_LENGTH = 200;
const MAX_PAGE = 1_000_000;

function singleValue(params: URLSearchParams, key: string): string | null {
  const values = params.getAll(key);
  return values.length === 1 ? values[0] ?? null : null;
}

/** Mirrors the toolbar's query bounds on the server, where client exports cannot execute. */
function customerQuery(params: URLSearchParams, config: DirectoryQueryConfig) {
  const rawSearch = singleValue(params, 'q')?.trim() ?? '';
  const q = rawSearch.length <= MAX_SEARCH_LENGTH ? rawSearch : '';
  const rawActivity = singleValue(params, 'activity');
  const activity = config.filters[0]?.options.some((option) => option.value === rawActivity)
    ? rawActivity ?? '' : '';
  const rawSort = singleValue(params, 'sort');
  const sort = config.sortOptions.some((option) => option.value === rawSort)
    ? rawSort ?? '' : '';
  const rawPage = singleValue(params, 'page');
  const parsedPage = rawPage && /^[1-9]\d*$/.test(rawPage) ? Number(rawPage) : 1;
  const page = Number.isSafeInteger(parsedPage) && parsedPage <= MAX_PAGE ? parsedPage : 1;
  return {
    q, filters: { activity }, sort, page,
  };
}

export function customerDirectoryConfig(locale: 'en' | 'es', canReadOrders: boolean): DirectoryQueryConfig {
  const es = locale === 'es';
  return {
    filters: canReadOrders ? [{
      key: 'activity',
      label: es ? 'Pedidos abiertos' : 'Open orders',
      options: [
        { value: 'with-orders', label: es ? 'Con pedidos abiertos' : 'With open orders' },
        { value: 'without-orders', label: es ? 'Sin pedidos abiertos' : 'Without open orders' },
      ],
    }] : [],
    sortOptions: [
      { value: 'name-desc', label: es ? 'Nombre Z–A' : 'Name Z–A' },
      ...(canReadOrders ? [
        { value: 'orders-desc', label: es ? 'Más pedidos abiertos' : 'Most open orders' },
        { value: 'pickup-asc', label: es ? 'Próxima recogida' : 'Next pickup' },
      ] : []),
    ],
  };
}

export function customerDirectorySearchParams(
  params: Record<string, string | string[] | undefined>,
): URLSearchParams {
  const search = new URLSearchParams();
  Object.entries(params).forEach(([key, value]) => {
    if (Array.isArray(value)) value.forEach((item) => search.append(key, item));
    else if (value !== undefined) search.set(key, value);
  });
  return search;
}

export function customerDirectoryView(
  customers: readonly Customer[],
  openOrders: readonly CustomerOrder[],
  canReadOrders: boolean,
  params: URLSearchParams,
  config: DirectoryQueryConfig,
  focusRowId?: string,
) {
  const query = customerQuery(params, config);
  const ordersByCustomer = new Map<string, CustomerOrder[]>();
  if (canReadOrders) {
    openOrders.forEach((order) => {
      const own = ordersByCustomer.get(order.customer_id) ?? [];
      own.push(order);
      ordersByCustomer.set(order.customer_id, own);
    });
  }
  const search = query.q.toLocaleLowerCase();
  const matches = customers.filter((customer) => {
    const own = ordersByCustomer.get(customer.id) ?? [];
    if (query.filters.activity === 'with-orders' && own.length === 0) return false;
    if (query.filters.activity === 'without-orders' && own.length > 0) return false;
    return !search || [customer.name, customer.contact_name, customer.email, customer.phone]
      .some((value) => value.toLocaleLowerCase().includes(search));
  });
  const sorted = matches.toSorted((a, b) => {
    const ownA = ordersByCustomer.get(a.id) ?? [];
    const ownB = ordersByCustomer.get(b.id) ?? [];
    if (query.sort === 'orders-desc' && ownA.length !== ownB.length) return ownB.length - ownA.length;
    if (query.sort === 'pickup-asc') {
      const pickupA = ownA.map((order) => order.needed_on).toSorted()[0];
      const pickupB = ownB.map((order) => order.needed_on).toSorted()[0];
      if (pickupA && !pickupB) return -1;
      if (!pickupA && pickupB) return 1;
      if (pickupA && pickupB && pickupA !== pickupB) return pickupA.localeCompare(pickupB);
    }
    return query.sort === 'name-desc'
      ? b.name.localeCompare(a.name) : a.name.localeCompare(b.name);
  });
  const pageCount = Math.max(1, Math.ceil(sorted.length / PAGE_SIZE));
  const page = Math.min(query.page, pageCount);
  const focusedIndex = focusRowId
    ? sorted.findIndex((customer) => customer.id === focusRowId) : -1;
  return {
    query,
    customers: sorted.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE),
    ordersByCustomer,
    resultCount: sorted.length,
    pageCount,
    page,
    pageSize: PAGE_SIZE,
    focusPage: focusedIndex < 0 ? null : Math.floor(focusedIndex / PAGE_SIZE) + 1,
  };
}
