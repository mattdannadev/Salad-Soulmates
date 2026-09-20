import { readFile } from 'node:fs/promises';

export const gateActor = '00000000-0000-4000-8000-000000000001';
const actor = gateActor;
const migrations = [
  '202609180001_foundation.sql',
  '202609180003_access_requests.sql',
  '20260919055744_recipe_master_and_approved_source_import.sql',
  '20260919154002_access_approval_workflow.sql',
  '20260919154004_receiving_workflow.sql',
  '20260919155843_permissions_and_reference_options.sql',
  '20260919170000_harden_function_grants.sql',
  '20260919231113_refactor_reliability.sql',
  '20260919231118_serialize_inventory_units.sql',
  '20260920011508_materials_purchasing.sql',
];

/** Apply migrations and synthetic identity data only inside the newly created test database. */
export async function initializeGateDatabase(execute: (sql: string) => Promise<unknown>) {
  await execute(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key);
    create function auth.uid() returns uuid language sql stable as
      $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
    grant usage on schema auth to authenticated, anon;
    grant execute on function auth.uid() to authenticated, anon;
  `);
  await migrations.reduce(async (previous, migration) => {
    await previous;
    await execute(await readFile(`supabase/migrations/${migration}`, 'utf8'));
    if (migration === '202609180001_foundation.sql') {
      await execute(`
        insert into auth.users values('${actor}');
        insert into public.organizations(id,name,slug)
          values('00000000-0000-4000-8000-000000000010','Concurrency fixture','concurrency-fixture');
        insert into public.facilities(id,organization_id,name)
          values('00000000-0000-4000-8000-000000000011','00000000-0000-4000-8000-000000000010','Fixture');
        insert into public.profiles(id,organization_id,facility_id,display_name,role)
          values('${actor}','00000000-0000-4000-8000-000000000010',
            '00000000-0000-4000-8000-000000000011','Fixture admin','admin');
      `);
    }
  }, Promise.resolve());
}
