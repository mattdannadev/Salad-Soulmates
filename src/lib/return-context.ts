import getSafeRedirectPath from './safe-redirect-path';

const VALIDATION_ORIGIN = 'https://return-context.invalid';
const MAX_FOCUS_ROW_LENGTH = 128;
const MALFORMED_ESCAPE = /%(?![0-9a-f]{2})/i;
const UNSAFE_PATH_ESCAPE = /%(?:2e|2f|5c|25)/i;
const FOCUS_ROW_PATTERN = /^[a-z\d_-]+$/i;

export interface ReturnContext {
  href: string;
  focusRow?: string;
}

export interface ReturnContextOptions {
  fallbackHref: string;
  isAllowedPathname: (pathname: string) => boolean;
}

/** Validate a return URL before it reaches a router or redirect API. */
function validatedHref(
  input: unknown,
  isAllowedPathname: (pathname: string) => boolean,
): string | null {
  if (typeof input !== 'string' || MALFORMED_ESCAPE.test(input)) return null;

  const rawPathname = input.split(/[?#]/u, 1)[0] ?? '';
  if (rawPathname.includes('\\') || UNSAFE_PATH_ESCAPE.test(rawPathname)) return null;

  const safeHref = getSafeRedirectPath(input);
  let destination: URL;
  try {
    destination = new URL(input, VALIDATION_ORIGIN);
  } catch (error) {
    if (error instanceof TypeError) return null;
    throw error;
  }

  if (
    destination.origin !== VALIDATION_ORIGIN
    || destination.href.slice(VALIDATION_ORIGIN.length) !== safeHref
    || !isAllowedPathname(destination.pathname)
  ) return null;

  return safeHref;
}

/**
 * Resolve untrusted return parameters to an authorized internal URL.
 * The caller owns route authorization; an invalid fallback is a programming error.
 */
export function resolveReturnContext(
  returnTo: unknown,
  focusRow: unknown,
  { fallbackHref, isAllowedPathname }: ReturnContextOptions,
): ReturnContext {
  const fallback = validatedHref(fallbackHref, isAllowedPathname);
  if (fallback === null) throw new Error('Return context fallback must be an allowed internal URL.');

  const href = validatedHref(returnTo, isAllowedPathname) ?? fallback;
  const validFocusRow = typeof focusRow === 'string'
    && focusRow.length > 0
    && focusRow.length <= MAX_FOCUS_ROW_LENGTH
    && FOCUS_ROW_PATTERN.test(focusRow);

  return validFocusRow ? { href, focusRow } : { href };
}

/** Encode return context for links and forms without manual URL concatenation. */
export function returnContextSearchParams(context: ReturnContext): URLSearchParams {
  const params = new URLSearchParams({ returnTo: context.href });
  if (context.focusRow) params.set('focusRow', context.focusRow);
  return params;
}
