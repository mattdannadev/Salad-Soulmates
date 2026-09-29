import { z } from 'zod';
import { resolveReturnContext, returnContextSearchParams } from '@/lib/return-context';
import type { ReturnContext } from '@/lib/return-context';

const DIRECTORY_PATH = '/app/ingredients';
const HOME_PATH = '/app';
const DETAIL_PATH = /^\/app\/ingredients\/([^/]+)$/u;

function isIngredientDestination(pathname: string): boolean {
  if (pathname === HOME_PATH || pathname === DIRECTORY_PATH) return true;
  const match = DETAIL_PATH.exec(pathname);
  return Boolean(match && z.uuid().safeParse(match[1]).success);
}

/** Allow Home onboarding, the ingredient directory, and ingredient detail paths. */
export function ingredientReturnContext(
  returnTo: unknown,
  focusRow: unknown,
  fallbackHref = DIRECTORY_PATH,
): ReturnContext {
  const context = resolveReturnContext(returnTo, focusRow, {
    fallbackHref,
    isAllowedPathname: isIngredientDestination,
  });
  if (new URL(context.href, 'https://ingredient-return.invalid').pathname === HOME_PATH) {
    return { href: context.href };
  }
  return context;
}

export function ingredientReturnHref(context: ReturnContext, focusRow?: string): string {
  const url = new URL(context.href, 'https://ingredient-return.invalid');
  if (url.pathname === DIRECTORY_PATH && focusRow) url.searchParams.set('focusRow', focusRow);
  return `${url.pathname}${url.search}${url.hash}`;
}

export function ingredientLinkHref(pathname: string, context: ReturnContext): string {
  return `${pathname}?${returnContextSearchParams(context).toString()}`;
}

/** Resume supplier setup at the ingredient's pack form with its directory origin intact. */
export function ingredientSupplierRecoveryHref(
  ingredientId: string,
  originContext?: ReturnContext,
): string {
  const detailQuery = originContext
    ? returnContextSearchParams(originContext)
    : new URLSearchParams();
  detailQuery.set('addPack', '1');
  const detailHref = `/app/ingredients/${ingredientId}?${detailQuery}`;
  return `/app/suppliers/new?${returnContextSearchParams({ href: detailHref })}`;
}
