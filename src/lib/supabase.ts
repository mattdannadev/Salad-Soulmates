import 'server-only';
import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { cookies } from 'next/headers';
import type { Database } from './database.types';
import { persistSessionCookies } from './session-cookies';

export class SupabaseConfigurationError extends Error {}

export function isConfigured() {
  return Boolean(
    process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY,
  );
}
export async function supabase({ readOnly = true, signal }: {
  readOnly?: boolean; signal?: AbortSignal;
} = {}) {
  signal?.throwIfAborted();
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) throw new Error('Supabase is not configured.');
  const jar = await cookies();
  signal?.throwIfAborted();
  return createServerClient<Database>(url, key, {
    ...(signal ? {
      global: {
        fetch: (input: RequestInfo | URL, init?: RequestInit) => fetch(input, {
          ...init,
          signal: init?.signal ? AbortSignal.any([signal, init.signal]) : signal,
        }),
      },
    } : {}),
    cookies: {
      getAll: () => jar.getAll(),
      setAll(values) {
        persistSessionCookies(
          values,
          (name, value, options) => {
            jar.set(name, value, options);
          },
          readOnly,
        );
      },
    },
  });
}

export function supabaseAdmin() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SECRET_KEY;
  if (!url || !key) throw new SupabaseConfigurationError('Account invitations are not configured.');
  return createClient<Database>(url, key, {
    auth: { autoRefreshToken: false, persistSession: false, detectSessionInUrl: false },
  });
}
