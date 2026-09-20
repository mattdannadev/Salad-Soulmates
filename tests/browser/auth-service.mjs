import { PGlite } from '@electric-sql/pglite';
import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { z } from 'zod';
import { initializeGateDatabase, gateActor } from '../integration/postgres-bootstrap.ts';
import {
  fixtureId,
  ADMIN_PERMISSIONS,
  fixtureRecords,
  selectFixtureRecords,
} from './fixture-data.ts';

// Local, deliberately minimal Auth/API fixture. It never connects to a hosted service.
const tables = new Set([
  'material_plans',
  'purchase_drafts',
  'purchase_draft_lines',
  'supplier_items',
  'inventory_receipts',
  'inventory_receipt_lines',
]);
const mutations = new Set([
  'save_material_plan',
  'create_purchase_draft',
  'change_purchase_status',
  'post_inventory_receipt',
]);
/** @type {Promise<PGlite> | undefined} */
let databasePromise;
let pending = Promise.resolve();
async function createDatabase() {
  const db = new PGlite();
  await initializeGateDatabase((sql) => db.exec(sql));
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
  await db.exec('set role authenticated');
  await db.exec(`
    insert into public.ingredients(id,name,category,default_uom) values
      ('${fixtureId(100)}','Preview garlic powder','Dry','lb'),
      ('${fixtureId(101)}','Preview lemon juice','Liquid','gal');
    insert into public.suppliers(id,name) values('${fixtureId(200)}','Preview supplier');
    insert into public.supplier_items(id,supplier_id,ingredient_id,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred)
      values('${fixtureId(210)}','${fixtureId(200)}','${fixtureId(100)}','pail',30,'lb',true),
      ('${fixtureId(211)}','${fixtureId(200)}','${fixtureId(101)}','case',5,'gal',true);
    insert into public.products(id,name) values('${fixtureId(300)}','Preview Italian dressing');
    insert into public.recipes(id,product_id,name) values('${fixtureId(400)}','${fixtureId(300)}','Preview Italian recipe');
    insert into public.recipe_versions(id,recipe_id,version_number) values('${fixtureId(401)}','${fixtureId(400)}',1);
    insert into public.recipe_sections(id,recipe_version_id,name,sequence) values('${fixtureId(410)}','${fixtureId(401)}','Main',1);
    insert into public.recipe_lines(recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
      values('${fixtureId(401)}','${fixtureId(410)}','${fixtureId(100)}','garlic',1,'1 lb',1,'lb'),
      ('${fixtureId(401)}','${fixtureId(410)}','${fixtureId(101)}','lemon',2,'2 gal',2,'gal');
    update public.recipe_versions set status='Released',released_by='${gateActor}' where id='${fixtureId(401)}';
  `);
  return db;
}
/** A localhost-only bridge to the real migration SQL; synthetic Auth remains separate. */
/** @param {URL} url */
function isPurchasingFixtureRequest(url) {
  const endpoint = url.pathname.replace('/rest/v1/', '');
  return (
    tables.has(endpoint)
    || endpoint === 'rpc/material_requirements' || endpoint === 'rpc/cancel_material_plan'
    || mutations.has(endpoint.replace('rpc/', ''))
    || endpoint === 'test/purchasing-reset'
  );
}
/** @param {URL} url @param {string} method @param {string} body */
async function executeRequest(url, method, body) {
  databasePromise ??= createDatabase();
  const db = await databasePromise;
  const endpoint = url.pathname.replace('/rest/v1/', '');
  if (endpoint === 'test/purchasing-reset') {
    await db.close();
    databasePromise = createDatabase();
    await databasePromise;
    return {};
  }
  if (tables.has(endpoint) && method === 'GET') {
    // Identifiers are selected from the closed allowlist, never interpolated arbitrary input.
    const result = await db.query(
      `select to_jsonb(record) as value from public.${endpoint} record order by id`,
    );
    return z
      .array(z.object({ value: z.record(z.string(), z.unknown()) }))
      .parse(result.rows)
      .map((record) => record.value);
  }
  if (endpoint === 'material_plans' && method === 'PATCH') {
    const id = z.uuid().parse(url.searchParams.get('id')?.replace('eq.', ''));
    const result = await db.query(
      "update public.material_plans set status='Cancelled' where id=$1 returning id",
      [id],
    );
    return result.rows[0] ?? null;
  }
  const input = JSON.parse(body);
  if (endpoint === 'rpc/cancel_material_plan') {
    const args = z.object({ plan_id: z.uuid() }).parse(input);
    const result = await db.query('select public.cancel_material_plan($1) as id', [args.plan_id]);
    return z.object({ id: z.uuid() }).parse(result.rows[0]).id;
  }
  if (endpoint === 'rpc/material_requirements') {
    const args = z.object({ plan_id: z.uuid() }).parse(input);
    const result = await db.query('select public.material_requirements($1) as value', [
      args.plan_id,
    ]);
    return z.object({ value: z.unknown() }).parse(result.rows[0]).value;
  }
  const name = z
    .enum([
      'save_material_plan',
      'create_purchase_draft',
      'change_purchase_status',
      'post_inventory_receipt',
    ])
    .parse(endpoint.replace('rpc/', ''));
  const { payload } = z.object({ payload: z.unknown() }).parse(input);
  const result = await db.query(`select public.${name}($1::jsonb) as id`, [
    JSON.stringify(payload),
  ]);
  return z.object({ id: z.uuid() }).parse(result.rows[0]).id;
}
/** Serialize shared-fixture requests while allowing the server to keep serving health checks. */
/** @param {URL} url @param {string} method @param {string} body */
function purchasingFixtureResponse(url, method, body) {
  const response = pending.then(async () => {
    try {
      return { status: 200, data: await executeRequest(url, method, body) };
    } catch (error) {
      const failure = z
        .object({ message: z.string(), code: z.string().optional() })
        .safeParse(error);
      if (!failure.success) throw error;
      return {
        status: 400,
        data: {
          code: failure.data.code ?? 'FIXTURE_SQL_ERROR',
          message: failure.data.message,
        },
      };
    }
  });
  pending = response.then(
    () => undefined,
    (error) => {
      console.error('purchasing_fixture_failed', error);
    },
  );
  return response;
}

const userId = '00000000-0000-4000-8000-000000000001';
const user = {
  id: userId,
  aud: 'authenticated',
  role: 'authenticated',
  email: 'admin@example.test',
  app_metadata: {},
  user_metadata: {},
  created_at: '2026-01-01T00:00:00Z',
};
const encode = (value) => Buffer.from(JSON.stringify(value)).toString('base64url');
const token = `${encode({ alg: 'HS256', typ: 'JWT' })}.${encode({
  sub: userId,
  aud: 'authenticated',
  role: 'authenticated',
  exp: Math.floor(Date.now() / 1000) + 3600,
})}.test-signature`;
const profile = {
  id: userId,
  organization_id: '00000000-0000-4000-8000-000000000010',
  facility_id: '00000000-0000-4000-8000-000000000011',
  display_name: 'Test Administrator',
  role: 'admin',
  preferred_locale: 'en',
  active: true,
  access_profile_id: '00000000-0000-4000-8000-000000000020',
};
const inventoryAttempts = [];
const attemptSchema = z.object({ request_id: z.uuid(), reason_note: z.string() });
createServer((request, response) => {
  const url = new URL(request.url ?? '/', 'http://127.0.0.1:4010');
  response.setHeader('Content-Type', 'application/json');
  if (url.pathname === '/test/inventory-attempts' && request.method === 'GET') {
    response.end(JSON.stringify(inventoryAttempts));
    return;
  }
  if (url.pathname === '/health') {
    response.end('{}');
    return;
  }
  let payload = '';
  request.on('data', (chunk) => {
    payload += chunk;
  });
  request.on('error', () => {
    response.writeHead(400);
    response.end('{}');
  });
  request.on('end', () => {
    if (isPurchasingFixtureRequest(url)) {
      purchasingFixtureResponse(url, request.method ?? 'GET', payload)
        .then((result) => {
          response.writeHead(result.status);
          response.end(JSON.stringify(result.data));
        })
        .catch((error) => {
          console.error('purchasing_fixture_request_failed', error);
          response.writeHead(500);
          response.end(
            JSON.stringify({ code: 'FIXTURE_FAILED', message: 'Fixture failed' }),
          );
        });
      return;
    }
    if (url.pathname === '/auth/v1/token') {
      let credentials;
      try {
        credentials = JSON.parse(payload);
      } catch {
        response.writeHead(400);
        response.end('{}');
        return;
      }
      if (
        credentials.email !== 'admin@example.test'
        || credentials.password !== 'local-test-password'
      ) {
        response.writeHead(400);
        response.end(
          JSON.stringify({
            code: 'invalid_credentials',
            msg: 'Invalid login credentials',
          }),
        );
        return;
      }
      response.end(
        JSON.stringify({
          access_token: token,
          refresh_token: 'local-test-refresh',
          token_type: 'bearer',
          expires_in: 3600,
          user,
        }),
      );
      return;
    }
    if (url.pathname === '/auth/v1/user') {
      response.end(JSON.stringify(user));
      return;
    }
    if (url.pathname === '/auth/v1/logout') {
      response.end('{}');
      return;
    }
    if (url.pathname.endsWith('/profiles')) {
      response.end(
        JSON.stringify(
          request.headers.accept?.includes('vnd.pgrst.object+json') ? profile : [profile],
        ),
      );
      return;
    }
    if (url.pathname.endsWith('/rpc/has_permission')) {
      const { requested } = JSON.parse(payload);
      response.end(JSON.stringify(ADMIN_PERMISSIONS.includes(requested)));
      return;
    }
    if (url.pathname.endsWith('/access_profile_permissions')) {
      response.end(
        JSON.stringify(
          ADMIN_PERMISSIONS.map((permissionCode) => ({
            access_profile_id: profile.access_profile_id,
            permission_code: permissionCode,
          })),
        ),
      );
      return;
    }
    if (url.pathname.endsWith('/facilities')) {
      const facility = {
        id: profile.facility_id,
        name: 'Local test facility',
        timezone: 'America/Chicago',
      };
      response.end(
        JSON.stringify(
          request.headers.accept?.includes('vnd.pgrst.object+json')
            ? facility
            : [facility],
        ),
      );
      return;
    }
    const table = url.pathname.slice('/rest/v1/'.length);
    if (
      request.method === 'GET'
      && url.pathname.startsWith('/rest/v1/')
      && fixtureRecords[table]
    ) {
      const records = selectFixtureRecords(table, url);
      response.end(
        JSON.stringify(
          request.headers.accept?.includes('vnd.pgrst.object+json')
            ? (records[0] ?? null)
            : records,
        ),
      );
      return;
    }
    if (request.method === 'HEAD') {
      response.setHeader('Content-Range', '*/0');
      response.end();
      return;
    }
    if (request.method === 'GET' && url.pathname.startsWith('/rest/v1/')) {
      response.end('[]');
      return;
    }
    if (url.pathname === '/rest/v1/inventory_events' && request.method === 'POST') {
      let submitted;
      try {
        submitted = JSON.parse(payload);
      } catch (error) {
        if (!(error instanceof SyntaxError)) throw error;
        response.writeHead(400);
        response.end('{}');
        return;
      }
      const attempt = attemptSchema.safeParse(submitted);
      if (attempt.success) {
        inventoryAttempts.push(attempt.data);
        if (inventoryAttempts.length > 50) inventoryAttempts.shift();
      }
    }
    response.writeHead(503);
    response.end(
      JSON.stringify({
        code: 'TEST_WRITE_FAILURE',
        message: 'Local fixture rejects writes',
      }),
    );
  });
}).listen(4010, '127.0.0.1');
