import { z } from 'zod';
import { resolveReturnContext, returnContextSearchParams } from '@/lib/return-context';
import type { ReturnContext } from '@/lib/return-context';
import { userDirectoryQuerySchema } from '@/lib/user-management-data';

const DIRECTORY_PATH = '/app/user-management/users';

/** Retain only the directory's supported search and sort state. */
export function userDirectoryHref(query: { q: string; sort: 'first_name' | 'last_name' }): string {
  const params = new URLSearchParams();
  if (query.q) params.set('q', query.q);
  if (query.sort !== 'last_name') params.set('sort', query.sort);
  return `${DIRECTORY_PATH}${params.size ? `?${params}` : ''}`;
}

/** User profiles only return to the directory that the access manager can open. */
export function userReturnContext(returnTo: unknown, focusRow: unknown): ReturnContext {
  const context = resolveReturnContext(returnTo, focusRow, {
    fallbackHref: DIRECTORY_PATH,
    isAllowedPathname: (pathname) => pathname === DIRECTORY_PATH,
  });
  const destination = new URL(context.href, 'https://user-return.invalid');
  const allowedKeys = new Set(['q', 'sort']);
  const validKeys = Array.from(destination.searchParams.keys()).every(
    (key) => allowedKeys.has(key) && destination.searchParams.getAll(key).length === 1,
  );
  const parsedQuery = userDirectoryQuerySchema.safeParse({
    q: destination.searchParams.get('q') ?? undefined,
    sort: destination.searchParams.get('sort') ?? undefined,
  });
  const href = validKeys && parsedQuery.success
    ? `${userDirectoryHref(parsedQuery.data)}${destination.hash}`
    : DIRECTORY_PATH;
  return context.focusRow && z.uuid().safeParse(context.focusRow).success
    ? { href, focusRow: context.focusRow }
    : { href };
}

export function userDetailHref(userId: string, directoryHref: string): string {
  const params = returnContextSearchParams({ href: directoryHref, focusRow: userId });
  return `${DIRECTORY_PATH}/${userId}?${params}`;
}

/** Focus the changed row when returning; preserve the original query and fragment. */
export function userReturnHref(context: ReturnContext, userId?: string): string {
  const url = new URL(context.href, 'https://user-return.invalid');
  const rowId = userId ?? context.focusRow;
  if (rowId && z.uuid().safeParse(rowId).success) url.searchParams.set('focusRow', rowId);
  return `${url.pathname}${url.search}${url.hash}`;
}
