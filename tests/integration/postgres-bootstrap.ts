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
  '20260920022110_customer_order_estimates.sql',
  '20260920031357_receiving_serialization.sql',
  '20260920032256_order_production_planning.sql',
  '20260920051807_packaging_setup.sql',
  '20260920051826_shipping_drafts.sql',
  '20260920063447_customer_directory.sql',
  '20260920121000_standalone_purchasing.sql',
  '20260920124904_dashboard_demand_purchasing.sql',
  '20260920190000_production_lots.sql',
  '20260920193000_batch_worksheet_execution.sql',
  '20260920194000_receipt_source_lots.sql',
  '20260920195000_traceability_lookup.sql',
  '20260920210000_customer_order_units.sql',
  '20260921132435_receive_purchase_delivery.sql',
  '20260921150000_standalone_purchase_orders.sql',
  '20260921160000_allow_optional_standalone_purchase_reason.sql',
  '20260921170000_user_management_foundation.sql',
  '20260921180000_backfill_profile_work_emails.sql',
  '20260921180100_change_user_access_profile.sql',
  '20260921190000_resync_profile_work_emails.sql',
  '20260921190200_preserve_access_manager.sql',
  '20260925021742_reactivate_user_access.sql',
  '20260925021812_inventory_management_controls.sql',
  '20260926040556_tenant_specific_signup_links.sql',
  '20260926040607_secure_production_rpc_tenant_scope.sql',
  '20260926040616_rate_limit_tenant_signup_requests.sql',
  '20260926040625_spice_preparation_consumption.sql',
  '20260926040633_spice_preparation_issues.sql',
];

/** Apply migrations and synthetic identity data only inside the newly created test database. */
export async function initializeGateDatabase(execute: (sql: string) => Promise<unknown>) {
  await execute(`
    do $$ begin
      if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
    end $$;
    create schema auth;
    create table auth.users(id uuid primary key, email text);
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
        insert into auth.users(id,email) values('${actor}','fixture-admin@example.test');
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
