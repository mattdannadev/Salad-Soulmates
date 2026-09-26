import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';

const USER_A = '00000000-0000-4000-8000-000000000001';
const USER_B = '00000000-0000-4000-8000-000000000002';
const ORGANIZATION_A = '00000000-0000-4000-8000-000000000010';
const ORGANIZATION_B = '00000000-0000-4000-8000-000000000020';
let db: PGlite;

async function asUser(
  userId: string,
  organizationId: string,
  canReadAudit: boolean,
  sql: string,
) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await db.query("select set_config('request.organization_id',$1,false)", [organizationId]);
  await db.query("select set_config('request.can_read_audit',$1,false)", [String(canReadAudit)]);
  await db.exec('set role authenticated');
  return db.query(sql);
}

beforeAll(async () => {
  db = new PGlite();
  await db.exec(`
    create role authenticated;
    create role anon;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
    create table public.organizations(id uuid primary key);
    create function public.current_org() returns uuid language sql stable as
      $$select nullif(current_setting('request.organization_id', true), '')::uuid$$;
    create function public.has_permission(requested text) returns boolean language sql stable as
      $$select requested = 'audit.read'
        and current_setting('request.can_read_audit', true) = 'true'$$;
    insert into auth.users(id) values('${USER_A}'), ('${USER_B}');
    insert into public.organizations(id) values('${ORGANIZATION_A}'), ('${ORGANIZATION_B}');
  `);
  await db.exec(
    readFileSync('supabase/migrations/20260926160821_application_error_logs.sql', 'utf8'),
  );
});

afterAll(async () => {
  await db?.close();
});

describe('application error log security', () => {
  it('allows safe append-only writes without exposing logs to ordinary users', async () => {
    await asUser(
      USER_A,
      ORGANIZATION_A,
      false,
      `insert into public.application_error_logs(
        operation, error_code, error_name, safe_message
      ) values('settings.load', '42P01', 'Error', 'Settings data could not be loaded.')`,
    );

    expect((await asUser(
      USER_A,
      ORGANIZATION_A,
      false,
      'select id from public.application_error_logs',
    )).rows).toEqual([]);
    await expect(asUser(
      USER_A,
      ORGANIZATION_A,
      true,
      "update public.application_error_logs set severity='warning'",
    )).rejects.toThrow();
    await expect(asUser(
      USER_A,
      ORGANIZATION_A,
      true,
      'delete from public.application_error_logs',
    )).rejects.toThrow();
  });

  it('allows audit readers to see only their organization logs', async () => {
    expect((await asUser(
      USER_A,
      ORGANIZATION_A,
      true,
      'select organization_id,reported_by,error_code from public.application_error_logs',
    )).rows).toEqual([{
      error_code: '42P01',
      organization_id: ORGANIZATION_A,
      reported_by: USER_A,
    }]);
    expect((await asUser(
      USER_B,
      ORGANIZATION_B,
      true,
      'select id from public.application_error_logs',
    )).rows).toEqual([]);
  });

  it('does not grant signed-out or tenant-column insert access', async () => {
    await db.exec('reset role; set role anon');
    await expect(db.query(
      `insert into public.application_error_logs(
        operation, error_code, error_name, safe_message
      ) values('settings.load', 'FAILED', 'Error', 'Failure')`,
    )).rejects.toThrow();
    await expect(asUser(
      USER_A,
      ORGANIZATION_A,
      false,
      `insert into public.application_error_logs(
        organization_id, operation, error_code, error_name, safe_message
      ) values('${ORGANIZATION_B}', 'settings.load', 'FAILED', 'Error', 'Failure')`,
    )).rejects.toThrow();
  });
});
