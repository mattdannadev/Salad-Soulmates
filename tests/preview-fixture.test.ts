import {
  afterEach, beforeEach, describe, expect, it, vi,
} from 'vitest';
import { z } from 'zod';
import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'node:fs';
import {
  assertPreviewEnvironment, FIXTURE_EMAIL, FIXTURE_KEY, FIXTURE_ORIGIN,
  FIXTURE_PASSWORD, previewFixtureFetch,
} from './browser/preview-fixture';

beforeEach(() => {
  vi.stubEnv('SS_BROWSER_TEST_PREVIEW', '1');
  vi.stubEnv('VERCEL', '');
  vi.stubEnv('VERCEL_ENV', '');
  vi.stubEnv('VERCEL_TARGET_ENV', '');
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_URL', FIXTURE_ORIGIN);
  vi.stubEnv('NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY', FIXTURE_KEY);
  vi.stubEnv('SUPABASE_SECRET_KEY', '');
  vi.stubEnv('SUPABASE_SERVICE_ROLE_KEY', '');
  vi.stubEnv('DATABASE_URL', '');
  vi.stubEnv('POSTGRES_URL', '');
});
afterEach(() => vi.unstubAllEnvs());

async function signIn(password = FIXTURE_PASSWORD) {
  return previewFixtureFetch(`${FIXTURE_ORIGIN}/auth/v1/token?grant_type=password`, {
    method: 'POST',
    headers: { apikey: FIXTURE_KEY, 'Content-Type': 'application/json' },
    body: JSON.stringify({ email: FIXTURE_EMAIL, password }),
  });
}

async function sessionHeaders() {
  const response = await signIn();
  const body: unknown = await response.json();
  const session = z.object({ access_token: z.string() }).parse(body);
  return { apikey: FIXTURE_KEY, Authorization: `Bearer ${session.access_token}` };
}

describe('test deployment isolation', () => {
  it.each([
    {},
    { SS_BROWSER_TEST_PREVIEW: '1', VERCEL_ENV: 'production' },
    { SS_BROWSER_TEST_PREVIEW: '1', VERCEL: '1' },
    { SS_BROWSER_TEST_PREVIEW: '1', VERCEL_TARGET_ENV: 'production' },
    { SS_BROWSER_TEST_PREVIEW: '1', SUPABASE_SECRET_KEY: 'must-not-be-loaded' },
    { SS_BROWSER_TEST_PREVIEW: '1', NEXT_PUBLIC_SUPABASE_URL: 'https://real.supabase.co' },
    { SS_BROWSER_TEST_PREVIEW: '1', NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY: 'real-key' },
  ])('rejects an unsafe environment %j', (environment) => {
    expect(() => assertPreviewEnvironment(environment)).toThrow();
  });

  it('allows an explicitly configured Vercel preview without a database', () => {
    expect(() => assertPreviewEnvironment({
      SS_BROWSER_TEST_PREVIEW: '1', VERCEL: '1', VERCEL_ENV: 'preview',
    })).not.toThrow();
  });

  it('rejects every external destination without performing a network request', async () => {
    const network = vi.spyOn(globalThis, 'fetch');
    await expect(previewFixtureFetch('https://real.supabase.co/rest/v1/ingredients'))
      .rejects.toThrow('unexpected backend destination');
    expect(network).not.toHaveBeenCalled();
    network.mockRestore();
  });

  it('returns a synthetic session and rejects invalid credentials and malformed JSON', async () => {
    expect((await signIn()).status).toBe(200);
    expect((await signIn('wrong-password')).status).toBe(400);
    expect((await previewFixtureFetch(`${FIXTURE_ORIGIN}/auth/v1/token?grant_type=password`, {
      method: 'POST', headers: { apikey: FIXTURE_KEY }, body: '{',
    })).status).toBe(400);
  });

  it('requires a session and rejects mutation and unsupported request paths', async () => {
    const headers = await sessionHeaders();
    expect((await previewFixtureFetch(`${FIXTURE_ORIGIN}/rest/v1/profiles`, {
      headers: { apikey: FIXTURE_KEY },
    })).status).toBe(401);
    expect((await previewFixtureFetch(`${FIXTURE_ORIGIN}/rest/v1/ingredients`, { headers })).status)
      .toBe(200);
    expect((await previewFixtureFetch(`${FIXTURE_ORIGIN}/rest/v1/ingredients`, {
      method: 'POST', headers, body: '{}',
    })).status).toBe(503);
    expect((await previewFixtureFetch(`${FIXTURE_ORIGIN}/rest/v1/not_implemented`, { headers })).status)
      .toBe(501);
  });

  it('supports the installed SDK through sign-in, reads, denied writes, refresh, and sign-out', async () => {
    const client = createClient(FIXTURE_ORIGIN, FIXTURE_KEY, {
      global: { fetch: previewFixtureFetch },
      auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    });
    const signInResult = await client.auth.signInWithPassword({
      email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD,
    });
    expect(signInResult.error).toBeNull();
    expect((await client.auth.getUser()).data.user?.email).toBe(FIXTURE_EMAIL);
    expect((await client.from('profiles').select('*').single()).error).toBeNull();
    expect((await client.rpc('has_permission', { requested: 'inventory.receive' })).data).toBe(true);
    expect((await client.rpc('has_permission', { requested: 'unauthorized' })).data).toBe(false);
    const inventory = await client.from('inventory_receipts').select('*');
    expect(inventory.error).toBeNull();
    expect(inventory.data).toEqual([]);
    const mutation = await client.rpc('post_inventory_receipt', { payload: {} });
    expect(mutation.error?.code).toBe('TEST_WRITE_FAILURE');
    expect((await client.auth.refreshSession()).error).toBeNull();
    expect((await client.auth.signOut()).error).toBeNull();
    expect((await client.auth.getSession()).data.session).toBeNull();
  });
});

it('retains every seeded administrator permission in the browser preview', async () => {
  const headers = await sessionHeaders();
  const response = await previewFixtureFetch(`${FIXTURE_ORIGIN}/rest/v1/access_profile_permissions`, { headers });
  const permissions = z.array(z.object({ permission_code: z.string() }))
    .parse(await response.json());
  const migration = readFileSync('supabase/migrations/20260919155843_permissions_and_reference_options.sql', 'utf8');
  const seeded = [...new Set([...migration.matchAll(/\('([a-z_]+\.[a-z_]+)'/g)].map((match) => match[1]))];
  expect(permissions.map((permission) => permission.permission_code).sort()).toEqual(seeded.sort());
});

it('serves synthetic recipe data through the SDK and filters missing records', async () => {
  const client = createClient(FIXTURE_ORIGIN, FIXTURE_KEY, {
    global: { fetch: previewFixtureFetch },
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
  });
  await client.auth.signInWithPassword({ email: FIXTURE_EMAIL, password: FIXTURE_PASSWORD });
  const result = await client.from('recipes').select('*');
  expect(result.error).toBeNull();
  const recipes = z.array(z.object({ id: z.uuid(), name: z.string() })).parse(result.data);
  expect(recipes[0]?.name).toBe('Preview Italian recipe');
  const missing = await client.from('recipes').select('*')
    .eq('id', '00000000-0000-4000-8000-000000009999').maybeSingle();
  expect(missing.error).toBeNull();
  expect(missing.data).toBeNull();
  await client.auth.signOut();
});
