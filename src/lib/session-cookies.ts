import type { CookieOptions } from '@supabase/ssr';
import { operationError } from './operation-error';

// Exact contract verified against Next 16.3.5 RequestCookiesAdapter.
export const READ_ONLY_COOKIE_ERROR = 'Cookies can only be modified in a Server Action or Route Handler. Read more: https://nextjs.org/docs/app/api-reference/functions/cookies#options';

/** Only Server Component reads may defer persistence to Proxy. Writes must fail closed. */
export function persistSessionCookies(
  values: { name: string; value: string; options: CookieOptions }[],
  write: (name: string, value: string, options: CookieOptions) => void,
  readOnly: boolean,
) {
  try {
    values.forEach(({ name, value, options }) => write(name, value, options));
  } catch (error) {
    if (readOnly && error instanceof Error && error.message === READ_ONLY_COOKIE_ERROR) {
      console.warn('session_cookie_refresh_deferred', { code: 'SERVER_COMPONENT_READ' });
      return;
    }
    throw operationError('session_cookie_write', 'Unable to persist the session.', error);
  }
}
