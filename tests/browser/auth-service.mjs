import { Buffer } from 'node:buffer';
import { createServer } from 'node:http';
import { z } from 'zod';
import { ADMIN_PERMISSIONS, fixtureRecords, selectFixtureRecords } from './fixture-data.ts';

// Local, deliberately minimal Auth/API fixture. It never connects to a hosted service.
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
    if (url.pathname === '/auth/v1/token') {
      let credentials;
      try {
        credentials = JSON.parse(payload);
      } catch {
        response.writeHead(400);
        response.end('{}');
        return;
      }
      if (credentials.email !== 'admin@example.test' || credentials.password !== 'local-test-password') {
        response.writeHead(400);
        response.end(
          JSON.stringify({ code: 'invalid_credentials', msg: 'Invalid login credentials' }),
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
      response.end(JSON.stringify(request.headers.accept?.includes('vnd.pgrst.object+json')
        ? profile : [profile]));
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
            access_profile_id: profile.access_profile_id, permission_code: permissionCode,
          })),
        ),
      );
      return;
    }
    if (url.pathname.endsWith('/facilities')) {
      const facility = { id: profile.facility_id, name: 'Local test facility', timezone: 'America/Chicago' };
      response.end(JSON.stringify(request.headers.accept?.includes('vnd.pgrst.object+json')
        ? facility : [facility]));
      return;
    }
    const table = url.pathname.slice('/rest/v1/'.length);
    if (request.method === 'GET' && url.pathname.startsWith('/rest/v1/') && fixtureRecords[table]) {
      const records = selectFixtureRecords(table, url);
      response.end(JSON.stringify(request.headers.accept?.includes('vnd.pgrst.object+json')
        ? records[0] ?? null : records));
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
      JSON.stringify({ code: 'TEST_WRITE_FAILURE', message: 'Local fixture rejects writes' }),
    );
  });
}).listen(4010, '127.0.0.1');
