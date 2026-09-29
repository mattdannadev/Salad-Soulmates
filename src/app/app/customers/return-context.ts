import { z } from 'zod';
import { resolveReturnContext, returnContextSearchParams } from '@/lib/return-context';
import type { ReturnContext } from '@/lib/return-context';

const CUSTOMER_PATH = '/app/customers';
const ORDER_PATH = '/app/orders';

/** Customers may return to their directory or resume an originating order. */
export function customerReturnContext(returnTo: unknown, focusRow: unknown): ReturnContext {
  return resolveReturnContext(returnTo, focusRow, {
    fallbackHref: CUSTOMER_PATH,
    isAllowedPathname: (pathname) => pathname === CUSTOMER_PATH || pathname === ORDER_PATH,
  });
}

/** Keep the origin's query and fragment while selecting the saved customer. */
export function customerReturnHref(context: ReturnContext, customerId?: string): string {
  const url = new URL(context.href, 'https://customer-return.invalid');
  const rowId = customerId ?? context.focusRow;
  if (customerId && z.uuid().safeParse(customerId).success) {
    url.searchParams.set('customer', customerId);
  }
  if (url.pathname === CUSTOMER_PATH && rowId && z.uuid().safeParse(rowId).success) {
    url.searchParams.set('focusRow', rowId);
  }
  return `${url.pathname}${url.search}${url.hash}`;
}

export function customerCreateHref(context: ReturnContext): string {
  return `${CUSTOMER_PATH}/new?${returnContextSearchParams(context)}`;
}

/** Preserve only the directory's defined URL state when constructing a return link. */
export function customerDirectoryHref(
  query: Record<string, string | string[] | undefined>,
): string {
  const params = new URLSearchParams();
  ['customer', 'q', 'activity', 'sort', 'page'].forEach((key) => {
    const value = query[key];
    if (typeof value === 'string' && value.length <= 200) params.set(key, value);
  });
  return `${CUSTOMER_PATH}${params.size ? `?${params}` : ''}`;
}
