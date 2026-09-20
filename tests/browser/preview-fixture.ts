import { Buffer } from 'node:buffer';
import { z } from 'zod';
import { ADMIN_PERMISSIONS, fixtureRecords, selectFixtureRecords } from './fixture-data';

export const FIXTURE_ORIGIN = 'https://browser-verification.invalid';
export const FIXTURE_KEY = 'browser-verification-publishable-key';
export const FIXTURE_EMAIL = 'admin@example.test';
export const FIXTURE_PASSWORD = 'local-test-password';
const SESSION_SECONDS = 3600;
const USER_ID = '00000000-0000-4000-8000-000000000001';
const USER = {
  id: USER_ID,
  aud: 'authenticated',
  role: 'authenticated',
  email: FIXTURE_EMAIL,
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const PROFILE = {
  id: USER_ID,
  organization_id: '00000000-0000-4000-8000-000000000010',
  facility_id: '00000000-0000-4000-8000-000000000011',
  display_name: 'Test Administrator',
  role: 'admin',
  preferred_locale: 'en',
  active: true,
  access_profile_id: '00000000-0000-4000-8000-000000000020',
};
const EMPTY_TABLES = new Set([
  'ingredients', 'products', 'suppliers', 'supplier_items', 'allergens',
  'ingredient_allergens', 'recipes', 'recipe_versions', 'recipe_sections',
  'recipe_lines', 'inventory_events', 'inventory_receipts', 'inventory_receipt_lines',
  'access_requests', 'reference_lists', 'reference_options', 'ingredient_translations',
  'access_profiles', 'feedback_items', 'recipe_qc_rules', 'permissions',
  'receipt_serializations', 'serialized_unit_events',
  'material_plans', 'purchase_drafts', 'purchase_draft_lines',
  'customers', 'customer_orders', 'customer_product_options',
]);
const credentialsSchema = z.object({
  email: z.literal(FIXTURE_EMAIL),
  password: z.literal(FIXTURE_PASSWORD),
});

/** Only the exported test bundle imports this module; no production feature flag is added. */
export function assertPreviewEnvironment(
  environment: Readonly<Record<string, string | undefined>>,
) {
  if (environment.SS_BROWSER_TEST_PREVIEW !== '1'
    || (environment.VERCEL === '1' && environment.VERCEL_ENV !== 'preview')
    || environment.VERCEL_ENV === 'production'
    || environment.VERCEL_TARGET_ENV === 'production') {
    throw new Error('Browser verification requires an explicitly enabled preview environment.');
  }
  if (environment.SUPABASE_SECRET_KEY || environment.SUPABASE_SERVICE_ROLE_KEY
    || environment.DATABASE_URL || environment.POSTGRES_URL) {
    throw new Error('Browser verification refuses configured database credentials.');
  }
  if ((environment.NEXT_PUBLIC_SUPABASE_URL
    && environment.NEXT_PUBLIC_SUPABASE_URL !== FIXTURE_ORIGIN)
    || (environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY
    && environment.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY !== FIXTURE_KEY)) {
    throw new Error('Browser verification refuses a real Supabase connection.');
  }
}

function json(body: unknown, status = 200) {
  return Response.json(body, { status, headers: { 'Cache-Control': 'no-store' } });
}

function createSession() {
  const encode = (value: unknown) => Buffer.from(JSON.stringify(value)).toString('base64url');
  // Deliberately not a real Supabase signature. This token only works with this fixture.
  const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
    sub: USER_ID,
    aud: 'authenticated',
    role: 'authenticated',
    exp: Math.floor(Date.now() / 1000) + SESSION_SECONDS,
  })}.test-signature`;
  return {
    access_token: token,
    refresh_token: 'local-test-refresh',
    token_type: 'bearer',
    expires_in: SESSION_SECONDS,
    user: USER,
  };
}

function hasFixtureSession(request: Request) {
  const token = request.headers.get('Authorization')?.replace(/^Bearer /, '');
  const parts = token?.split('.');
  if (parts?.length !== 3 || parts[2] !== 'test-signature' || !parts[1]) return false;
  try {
    const claims: unknown = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    return z.object({ sub: z.literal(USER_ID), exp: z.number().gt(Date.now() / 1000) })
      .safeParse(claims).success;
  } catch (error) {
    if (error instanceof SyntaxError) return false;
    throw error;
  }
}

async function tokenResponse(request: Request) {
  let input: unknown;
  try {
    input = await request.json();
  } catch (error) {
    if (error instanceof SyntaxError) {
      return json({ code: 'invalid_json', msg: 'Malformed test request' }, 400);
    }
    throw error;
  }
  const url = new URL(request.url);
  const validPassword = url.searchParams.get('grant_type') === 'password'
    && credentialsSchema.safeParse(input).success;
  const validRefresh = url.searchParams.get('grant_type') === 'refresh_token'
    && z.object({ refresh_token: z.literal('local-test-refresh') }).safeParse(input).success;
  if (!validPassword && !validRefresh) {
    return json({ code: 'invalid_credentials', msg: 'Invalid login credentials' }, 400);
  }
  return json(createSession());
}

/** In-process synthetic HTTP responses. Never delegates to fetch or any external service. */
export const previewFixtureFetch: typeof fetch = async (input, init) => {
  assertPreviewEnvironment(process.env);
  const request = new Request(input, init);
  const url = new URL(request.url);
  if (url.origin !== FIXTURE_ORIGIN) {
    throw new Error('Browser verification blocked an unexpected backend destination.');
  }
  if (request.headers.get('apikey') !== FIXTURE_KEY) {
    return json({ message: 'Invalid fixture API key' }, 401);
  }
  if (url.pathname === '/auth/v1/token' && request.method === 'POST') {
    return tokenResponse(request);
  }
  if (!hasFixtureSession(request)) {
    return json({ code: 'bad_jwt', msg: 'Test session required' }, 401);
  }
  if (url.pathname === '/auth/v1/user' && request.method === 'GET') return json(USER);
  if (url.pathname === '/auth/v1/logout' && request.method === 'POST') return json({});
  if (url.pathname === '/rest/v1/rpc/has_permission' && request.method === 'POST') {
    const inputBody: unknown = await request.json();
    const permission = z.object({ requested: z.string() }).safeParse(inputBody);
    return json(permission.success && ADMIN_PERMISSIONS.includes(permission.data.requested));
  }
  if (url.pathname === '/rest/v1/rpc/find_serialized_units') return json([]);
  if (request.method !== 'GET' && request.method !== 'HEAD') {
    return json({ code: 'TEST_WRITE_FAILURE', message: 'Test preview rejects business-data writes' }, 503);
  }
  if (url.pathname === '/rest/v1/profiles') {
    return json(request.headers.get('Accept')?.includes('vnd.pgrst.object+json')
      ? PROFILE : [PROFILE]);
  }
  if (url.pathname === '/rest/v1/access_profile_permissions') {
    return json(ADMIN_PERMISSIONS.map((permissionCode) => ({
      access_profile_id: PROFILE.access_profile_id, permission_code: permissionCode,
    })));
  }
  if (url.pathname === '/rest/v1/facilities') {
    const facility = { id: PROFILE.facility_id, name: 'Isolated test facility', timezone: 'America/Chicago' };
    return json(request.headers.get('Accept')?.includes('vnd.pgrst.object+json') ? facility : [facility]);
  }
  const table = url.pathname.slice('/rest/v1/'.length);
  if (url.pathname.startsWith('/rest/v1/') && fixtureRecords[table]) {
    const records = selectFixtureRecords(table, url);
    if (request.method === 'HEAD') {
      return new Response(null, { headers: { 'Content-Range': `*/${records.length}` } });
    }
    return json(request.headers.get('Accept')?.includes('vnd.pgrst.object+json')
      ? records[0] ?? null : records);
  }
  if (url.pathname.startsWith('/rest/v1/') && EMPTY_TABLES.has(url.pathname.slice('/rest/v1/'.length))) {
    if (request.method === 'HEAD') {
      return new Response(null, { headers: { 'Content-Range': '*/0', 'Cache-Control': 'no-store' } });
    }
    return json([]);
  }
  return json({ code: 'UNSUPPORTED_FIXTURE_REQUEST', message: 'Test fixture does not implement this request' }, 501);
};
