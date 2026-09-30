import { Buffer } from 'node:buffer';
import { createServerClient, type CookieOptions } from '@supabase/ssr';
import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { z } from 'zod';
import { requireRecentProviderOwnerAuthentication } from '../src/services/provider-fresh-auth';

const state = vi.hoisted(() => ({
  makeClient: vi.fn(),
  isOwner: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('../src/data/provider-owner', () => ({ default: state.isOwner }));
vi.mock('../src/lib/supabase', () => ({ supabase: () => Promise.resolve(state.makeClient()) }));

const origin = 'https://provider-auth-boundary.invalid';
const publishableKey = 'provider-auth-boundary-publishable-key';
const userId = '00000000-0000-4000-8000-000000000001';
const sessionId = '00000000-0000-4000-8000-000000000002';
const email = 'owner@example.test';
const password = 'local-test-password';
const now = 1_800_000_000;
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email,
  email_confirmed_at: '2026-09-29T00:00:00Z',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-09-29T00:00:00Z',
};

function token() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  return `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: userId,
    session_id: sessionId,
    aud: 'authenticated',
    role: 'authenticated',
    is_anonymous: false,
    iat: now,
    exp: now + 3600,
    amr: [{ method: 'password', timestamp: now }],
  })}.${encode('fixture-signature')}`;
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

describe('Supabase SSR fresh-auth boundary', () => {
  let revoked = false;
  let cookies: Map<string, { value: string; options: CookieOptions }>;
  let fetchAuth: typeof fetch;

  function makeRealClient() {
    return createServerClient(origin, publishableKey, {
      global: { fetch: fetchAuth },
      cookies: {
        getAll: () => [...cookies].map(([name, { value }]) => ({ name, value })),
        setAll: (values) => values.forEach(({ name, value, options }) => {
          if (options.maxAge === 0) cookies.delete(name);
          else cookies.set(name, { value, options });
        }),
      },
    });
  }

  beforeEach(() => {
    vi.clearAllMocks();
    vi.setSystemTime(new Date(now * 1000));
    revoked = false;
    cookies = new Map();
    state.isOwner.mockResolvedValue(true);
    fetchAuth = async (input, init) => {
      const request = new Request(input, init);
      const url = new URL(request.url);
      if (url.origin !== origin) throw new Error('Unexpected external request');
      if (request.headers.get('apikey') !== publishableKey) return json({}, 401);
      if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
        const body: unknown = await request.json();
        if (url.searchParams.get('grant_type') !== 'password'
          || !z.object({ email: z.literal(email), password: z.literal(password) })
            .safeParse(body).success) {
          return json({ code: 'invalid_credentials', msg: 'Invalid credentials' }, 400);
        }
        return json({
          access_token: token(),
          refresh_token: 'fixture-refresh-token',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        });
      }
      if (url.pathname === '/auth/v1/user' && request.method === 'GET') {
        if (revoked || request.headers.get('Authorization') !== `Bearer ${token()}`) {
          return json({ code: 'session_not_found', msg: 'Session revoked' }, 401);
        }
        return json(user);
      }
      return json({ code: 'not_found', msg: 'Unsupported test request' }, 404);
    };
    state.makeClient.mockImplementation(makeRealClient);
  });

  it('persists password session cookies and denies a revoked Auth session', async () => {
    const firstRequest = makeRealClient();
    const result = await firstRequest.auth.signInWithPassword({ email, password });
    expect(result.error).toBeNull();
    expect(cookies.size).toBeGreaterThan(0);

    const nextRequest = makeRealClient();
    expect((await nextRequest.auth.getSession()).data.session?.access_token).toBe(token());
    expect((await nextRequest.auth.getClaims(token())).error).toBeNull();
    await expect(requireRecentProviderOwnerAuthentication()).resolves.toMatchObject({
      actorUserId: userId,
      sessionId,
    });

    revoked = true;
    await expect(requireRecentProviderOwnerAuthentication())
      .rejects.toThrow('Sign in and confirm your password');
  });
});
