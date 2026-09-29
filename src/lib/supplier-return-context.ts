import { z } from 'zod';
import { resolveReturnContext, type ReturnContext } from './return-context';

const SUPPLIER_DIRECTORY_PATH = '/app/suppliers';
const HOME_PATH = '/app';
const INGREDIENT_DETAIL_PATH = /^\/app\/ingredients\/([^/]+)$/u;

export function isSupplierHomeReturn(href: string): boolean {
  return href.split(/[?#]/u, 1)[0] === HOME_PATH;
}

export function isSupplierDirectoryReturn(href: string): boolean {
  return href.split(/[?#]/u, 1)[0] === SUPPLIER_DIRECTORY_PATH;
}

/** Supplier creation may resume Home, its directory, or a specific ingredient. */
export function supplierReturnContext(returnTo: unknown, focusRow: unknown): ReturnContext {
  const context = resolveReturnContext(returnTo, focusRow, {
    fallbackHref: SUPPLIER_DIRECTORY_PATH,
    isAllowedPathname: (pathname) => {
      if (pathname === HOME_PATH || pathname === SUPPLIER_DIRECTORY_PATH) return true;
      const match = INGREDIENT_DETAIL_PATH.exec(pathname);
      return Boolean(match && z.uuid().safeParse(match[1]).success);
    },
  });
  return isSupplierDirectoryReturn(context.href) ? context : { href: context.href };
}
