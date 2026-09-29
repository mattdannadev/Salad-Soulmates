import { z } from 'zod';
import { resolveReturnContext, returnContextSearchParams } from '@/lib/return-context';
import type { ReturnContext } from '@/lib/return-context';

const DIRECTORY_PATH = '/app/ingredients';
const DETAIL_PATH = /^\/app\/ingredients\/([^/]+)$/u;

function isIngredientDestination(pathname: string): boolean {
  if (pathname === DIRECTORY_PATH) return true;
  const match = DETAIL_PATH.exec(pathname);
  return Boolean(match && z.uuid().safeParse(match[1]).success);
}

/** Allow only the ingredient directory and existing-style ingredient detail paths. */
export function ingredientReturnContext(
  returnTo: unknown,
  focusRow: unknown,
  fallbackHref = DIRECTORY_PATH,
): ReturnContext {
  return resolveReturnContext(returnTo, focusRow, {
    fallbackHref,
    isAllowedPathname: isIngredientDestination,
  });
}

export function ingredientReturnHref(context: ReturnContext, focusRow?: string): string {
  const url = new URL(context.href, 'https://ingredient-return.invalid');
  if (url.pathname === DIRECTORY_PATH && focusRow) url.searchParams.set('focusRow', focusRow);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function ingredientLinkHref(pathname: string, context: ReturnContext): string {
  return `${pathname}?${returnContextSearchParams(context).toString()}`;
}
