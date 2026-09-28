import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, beforeAll, beforeEach, describe, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;

async function asUser(actor: string | null, sql: string, parameters: unknown[] = []) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ?? '']);
  await database.exec(`set role ${actor === null ? 'anon' : 'authenticated'}`);
  return database.query(sql, parameters);
}

async function begin(actor: string | null, intent: string, requestId: string) {
  return asUser(actor, 'select public.begin_operations_copilot_request($1,$2) as status', [
    intent, requestId,
  ]);
}

beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await database.exec('reset role');
  await database.exec(`
    update public.organizations set operations_copilot_plan_enabled=true where id='${id(10)}';
    update public.access_profiles set operations_copilot_enabled=true
      where organization_id='${id(10)}' and base_role='admin';
    insert into auth.users(id,email) values
      ('${id(2)}','reviewer@example.test'),('${id(3)}','outside@example.test');
    insert into public.organizations(id,name,slug,operations_copilot_plan_enabled)
      values('${id(20)}','Outside','outside-copilot',true);
    insert into public.facilities(id,organization_id,name)
      values('${id(21)}','${id(20)}','Outside');
    insert into public.access_profiles(id,organization_id,name,base_role,operations_copilot_enabled)
      values('${id(22)}','${id(20)}','Outside admin','admin',true);
    insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
      values('${id(20)}','${id(22)}','products.read');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      values
      ('${id(2)}','${id(10)}','${id(11)}','Reviewer','reviewer',
        (select id from public.access_profiles where organization_id='${id(10)}'
          and name='Operations Reviewer' limit 1)),
      ('${id(3)}','${id(20)}','${id(21)}','Outside admin','admin','${id(22)}');
  `);
});

beforeEach(async () => {
  await database.exec('reset role');
  await database.exec('truncate public.operations_copilot_requests restart identity');
});

afterAll(async () => database?.close());

describe('Operations Copilot durable gate and audit', () => {
  it('keeps audit rows behind RLS and restricts function execution', async () => {
    await database.exec('reset role');
    const catalog = await database.query<{
      rls: boolean;
      begin_definer: boolean;
      begin_search_path: string[];
      anon_begin: boolean;
      authenticated_begin: boolean;
      anon_purge: boolean;
    }>(`
      select c.relrowsecurity as rls,
        p.prosecdef as begin_definer, p.proconfig as begin_search_path,
        has_function_privilege('anon','public.begin_operations_copilot_request(text,uuid)','EXECUTE')
          as anon_begin,
        has_function_privilege('authenticated','public.begin_operations_copilot_request(text,uuid)','EXECUTE')
          as authenticated_begin,
        has_function_privilege('anon','public.purge_operations_copilot_requests()','EXECUTE')
          as anon_purge
      from pg_class c
      join pg_proc p on p.proname='begin_operations_copilot_request'
      where c.oid='public.operations_copilot_requests'::regclass
    `);
    expect(catalog.rows).toEqual([{
      rls: true,
      begin_definer: true,
      begin_search_path: ['search_path=""'],
      anon_begin: false,
      authenticated_begin: true,
      anon_purge: false,
    }]);
  });

  it('denies anonymous function and table access', async () => {
    await expect(begin(null, 'recipes', id(100))).rejects.toThrow('permission denied');
    await expect(asUser(null, 'select * from public.operations_copilot_requests'))
      .rejects.toThrow('permission denied');
  });

  it('allows only entitled administrators with the intent permission', async () => {
    expect((await begin(gateActor, 'recipes', id(100))).rows).toEqual([{ status: 'accepted' }]);
    expect((await begin(id(2), 'recipes', id(101))).rows).toEqual([{ status: 'denied' }]);
    expect((await begin(id(3), 'orders', id(102))).rows).toEqual([{ status: 'denied' }]);
    expect((await begin(id(3), 'recipes', id(103))).rows).toEqual([{ status: 'accepted' }]);
    expect((await begin(gateActor, 'inventory', id(104))).rows).toEqual([{ status: 'denied' }]);
    await database.exec('reset role');
    const rows = await database.query<{
      organization_id: string; facility_id: string; outcome: string;
    }>('select organization_id,facility_id,outcome from public.operations_copilot_requests order by id');
    expect(rows.rows).toEqual([
      { organization_id: id(10), facility_id: id(11), outcome: 'accepted' },
      { organization_id: id(10), facility_id: id(11), outcome: 'denied' },
      { organization_id: id(20), facility_id: id(21), outcome: 'denied' },
      { organization_id: id(20), facility_id: id(21), outcome: 'accepted' },
    ]);
  });

  it('enforces a durable per-user hourly limit and appends completion', async () => {
    const requestIds = Array.from({ length: 20 }, (_, index) => id(200 + index));
    const statuses = await requestIds.reduce<Promise<unknown[]>>(async (previous, requestId) => {
      const prior = await previous;
      const result = await begin(gateActor, 'recipes', requestId);
      return [...prior, result.rows];
    }, Promise.resolve([]));
    expect(statuses).toEqual(Array.from({ length: 20 }, () => [{ status: 'accepted' }]));
    expect((await begin(gateActor, 'orders', id(300))).rows)
      .toEqual([{ status: 'rate_limited' }]);
    await asUser(gateActor, 'select public.finish_operations_copilot_request($1,$2)', [
      id(200), 'completed',
    ]);
    await expect(asUser(gateActor, 'select public.finish_operations_copilot_request($1,$2)', [
      id(200), 'completed',
    ])).rejects.toThrow('already completed');
    await expect(asUser(id(3), 'select public.finish_operations_copilot_request($1,$2)', [
      id(201), 'failed',
    ])).rejects.toThrow('not found');
    await database.exec('reset role');
    const audit = await database.query<{ outcome: string }>(
      'select outcome from public.operations_copilot_requests where correlation_id=$1 order by id',
      [id(200)],
    );
    expect(audit.rows).toEqual([{ outcome: 'accepted' }, { outcome: 'completed' }]);
  });

  it('prevents direct mutation of metadata history', async () => {
    await begin(gateActor, 'recipes', id(400));
    await expect(asUser(gateActor, 'delete from public.operations_copilot_requests'))
      .rejects.toThrow('permission denied');
    await expect(asUser(gateActor, 'update public.operations_copilot_requests set outcome=$1', [
      'completed',
    ])).rejects.toThrow('permission denied');
  });

  it('enforces the organization limit across different actors', async () => {
    await database.exec('reset role');
    await database.exec(`
      insert into public.operations_copilot_requests
        (correlation_id,organization_id,facility_id,actor_user_id,intent,outcome)
      select gen_random_uuid(),'${id(10)}','${id(11)}','${id(2)}','recipes','accepted'
      from generate_series(1,100);
    `);
    expect((await begin(gateActor, 'recipes', id(500))).rows)
      .toEqual([{ status: 'rate_limited' }]);
  });
});
