import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import {
  beforeAll, afterAll, describe, it, expect,
} from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
let normalizedSlugCollisionError: unknown;
let invalidLegacySlugError: unknown;
async function asUser(user: number, sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(user)]);
  await db.exec('set role authenticated');
  return db.query(sql, params);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth;
 create table auth.users(id uuid primary key, email text);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(readFileSync('supabase/migrations/202609180001_foundation.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202609180003_access_requests.sql', 'utf8'));
  await db.exec(
    readFileSync(
      'supabase/migrations/20260919055744_recipe_master_and_approved_source_import.sql',
      'utf8',
    ),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260919154002_access_approval_workflow.sql', 'utf8'),
  );
  await db.exec(readFileSync('supabase/migrations/20260919154004_receiving_workflow.sql', 'utf8'));
  await db.exec(`insert into auth.users(id,email) values
 ('${id(1)}','admin@example.com'),('${id(2)}','admin-b@example.com'),
 ('${id(3)}',null),('${id(4)}',null),('${id(5)}',null),('${id(6)}',null),
 ('${id(7)}',null),('${id(8)}',null),('${id(9)}',null),('${id(30)}',null);
 insert into public.organizations(id,name,slug) values('${id(10)}','A','a'),('${id(20)}','B','b');
 insert into public.facilities(id,organization_id,name) values('${id(11)}','${id(10)}','A'),('${id(21)}','${id(20)}','B'),('${id(12)}','${id(10)}','A2');
 insert into public.profiles(id,organization_id,facility_id,display_name,role) values
 ('${id(1)}','${id(10)}','${id(11)}','Admin A','admin'),('${id(2)}','${id(20)}','${id(21)}','Admin B','admin'),
 ('${id(3)}','${id(10)}','${id(11)}','Worker A','worker'),('${id(4)}','${id(10)}','${id(11)}','Reviewer A','reviewer'),
 ('${id(5)}','${id(10)}','${id(12)}','Admin A2','admin'),('${id(6)}','${id(10)}','${id(11)}','Receiver A','receiver'),
 ('${id(8)}','${id(10)}','${id(11)}','Auditor A','reviewer'),('${id(9)}','${id(10)}','${id(11)}','   ','reviewer'),
 ('${id(30)}','${id(10)}','${id(11)}','First '||repeat('L',150),'reviewer');`);
  await db.exec(
    readFileSync(
      'supabase/migrations/20260919155843_permissions_and_reference_options.sql',
      'utf8',
    ),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260919170000_harden_function_grants.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260919231113_refactor_reliability.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260919231118_serialize_inventory_units.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260921170000_user_management_foundation.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260921180000_backfill_profile_work_emails.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260921180100_change_user_access_profile.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260921190000_resync_profile_work_emails.sql', 'utf8'),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260921190200_preserve_access_manager.sql', 'utf8'),
  );
  const tenantSignupMigration = readFileSync(
    'supabase/migrations/20260926040556_tenant_specific_signup_links.sql',
    'utf8',
  );
  const slugValidationSql = tenantSignupMigration.slice(
    0,
    tenantSignupMigration.indexOf('update public.organizations'),
  );
  await db.query(
    'insert into public.organizations(id,name,slug) values($1,$2,$3)',
    [id(99), 'Normalized collision', ' A '],
  );
  try {
    await db.exec(slugValidationSql);
  } catch (cause) {
    normalizedSlugCollisionError = cause;
  }
  await db.query('delete from public.organizations where id=$1', [id(99)]);
  await db.query(
    'insert into public.organizations(id,name,slug) values($1,$2,$3)',
    [id(99), 'Too long', `a${'b'.repeat(63)}`],
  );
  try {
    await db.exec(slugValidationSql);
  } catch (cause) {
    invalidLegacySlugError = cause;
  }
  await db.query('delete from public.organizations where id=$1', [id(99)]);
  await db.exec(tenantSignupMigration);
  await db.exec(
    readFileSync(
      'supabase/migrations/20260926040616_rate_limit_tenant_signup_requests.sql',
      'utf8',
    ),
  );
});
afterAll(async () => {
  await db?.close();
});
describe('foundation migration against PostgreSQL (PGlite)', () => {
  it('rejects normalized legacy slug collisions and non-canonical future slugs', async () => {
    expect(normalizedSlugCollisionError).toMatchObject({ code: '23505' });
    expect(invalidLegacySlugError).toMatchObject({ code: '23514' });
    await expect(
      db.query(
        'insert into public.organizations(id,name,slug) values($1,$2,$3)',
        [id(99), 'Non-canonical', ' A '],
      ),
    ).rejects.toMatchObject({ code: '23514' });
    await expect(
      db.query(
        'insert into public.organizations(id,name,slug) values($1,$2,$3)',
        [id(99), 'Too long', `a${'b'.repeat(63)}`],
      ),
    ).rejects.toMatchObject({ code: '23514' });
  });
  it('copies authentication emails into profiles and resynchronizes a changed address', async () => {
    expect(
      (await db.query('select work_email from public.profiles where id=$1', [id(1)])).rows,
    ).toEqual([{ work_email: 'admin@example.com' }]);

    await db.query('update auth.users set email=$1 where id=$2', [
      'admin-renamed@example.com',
      id(1),
    ]);
    await db.exec(
      readFileSync('supabase/migrations/20260921190000_resync_profile_work_emails.sql', 'utf8'),
    );

    expect(
      (await db.query('select work_email from public.profiles where id=$1', [id(1)])).rows,
    ).toEqual([{ work_email: 'admin-renamed@example.com' }]);
  });

  it('has RLS on all twenty-nine application tables', async () => {
    const result = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(result.rows).toHaveLength(29);
    expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it('does not expose security-definer trigger helpers for direct execution', async () => {
    const result = await db.query<{ grantee: string; routine_name: string }>(
      `select grantee,routine_name from information_schema.routine_privileges
       where specific_schema='public' and routine_name in ('audit_change','guard_ingredient_unit','validate_inventory')
       and privilege_type='EXECUTE' and grantee in ('PUBLIC','authenticated','anon')`,
    );
    expect(result.rows).toHaveLength(0);
  });
  it('saves an ingredient and reviewed Spanish display name atomically', async () => {
    const result = await asUser(1, 'select public.save_ingredient($1::jsonb) as id', [
      JSON.stringify({
        id: id(100),
        name: 'Garlic',
        category: 'Dry',
        default_uom: 'lb',
        spanish_name: 'Ajo',
        allergen_ids: [],
      }),
    ]);
    expect(result.rows[0]).toEqual({ id: id(100) });
    const rows = await asUser(
      1,
      'select display_name,approved_by from public.ingredient_translations',
    );
    expect(rows.rows[0]).toEqual({ display_name: 'Ajo', approved_by: id(1) });
  });
  it('hides records across organizations and rejects cross-organization writes', async () => {
    expect((await asUser(2, 'select * from public.ingredients')).rows).toHaveLength(0);
    await expect(
      asUser(
        2,
        'insert into public.ingredients(organization_id,name,default_uom) values($1,$2,$3)',
        [id(10), 'Intruder', 'lb'],
      ),
    ).rejects.toThrow();
  });
  it('prevents worker access and reviewer changes to master data', async () => {
    expect((await asUser(3, 'select * from public.ingredients')).rows).toHaveLength(0);
    await expect(
      asUser(3, "insert into public.ingredients(name,default_uom) values('Worker entry','lb')"),
    ).rejects.toThrow();
    expect((await asUser(4, 'select * from public.ingredients')).rows).toHaveLength(1);
    await expect(asUser(4, "select public.save_ingredient('{}'::jsonb)")).rejects.toThrow(
      'Master data permission required',
    );
  });
  it('rejects unauthorized inventory writes before the definer trigger reads ingredients', async () => {
    await expect(asUser(3, `insert into public.inventory_events
      (ingredient_id,event_type,quantity_delta,uom,reason_note,request_id)
      values($1,'OpeningBalance',1,'gal','Unauthorized probe',gen_random_uuid())`, [id(100)]))
      .rejects.toThrow('Inventory permission required');
  });
  it('prevents self-promotion or changing organization membership', async () => {
    await expect(
      asUser(3, "update public.profiles set role='admin' where id=$1", [id(3)]),
    ).rejects.toThrow();
  });
  it('audits ledger entries, prevents duplicate submits and preserves history', async () => {
    const sql = "insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id) values($1,'OpeningBalance',25,'lb','Test opening balance',$2)";
    await asUser(1, sql, [id(100), id(200)]);
    await expect(asUser(1, sql, [id(100), id(200)])).rejects.toThrow();
    expect(
      (await asUser(1, "select * from public.audit_events where entity_type='inventory_events'"))
        .rows,
    ).toHaveLength(1);
    await expect(
      asUser(1, 'update public.inventory_events set quantity_delta=999'),
    ).rejects.toThrow();
    await expect(asUser(1, 'delete from public.inventory_events')).rejects.toThrow();
    await expect(asUser(1, 'delete from public.audit_events')).rejects.toThrow();
  });
  it.each([
    [1, 'gal', 'Wrong unit', id(1)],
    [1, 'lb', '', id(1)],
    [-1, 'lb', 'Bad opening', id(1)],
    [1, 'lb', 'Forged actor', id(2)],
  ])('rejects invalid inventory: %s %s %s', async (qty, uom, reason, actor) => {
    await expect(
      asUser(
        1,
        "insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,created_by) values($1,'OpeningBalance',$2,$3,$4,gen_random_uuid(),$5)",
        [id(100), qty, uom, reason, actor],
      ),
    ).rejects.toThrow();
  });
  it('locks ingredient units even when history belongs to another facility', async () => {
    await expect(
      asUser(5, "update public.ingredients set default_uom='gal' where id=$1", [id(100)]),
    ).rejects.toThrow('Base unit cannot change');
  });
  it('enforces pack size, preferred-pack uniqueness and tenant-safe relationships', async () => {
    await asUser(1, "insert into public.suppliers(id,name) values($1,'Supplier A')", [id(300)]);
    await asUser(2, "insert into public.suppliers(id,name) values($1,'Supplier B')", [id(301)]);
    const sql = "insert into public.supplier_items(ingredient_id,supplier_id,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred) values($1,$2,'bag',$3,'lb',true)";
    await expect(asUser(1, sql, [id(100), id(301), 50])).rejects.toThrow();
    await expect(asUser(1, sql, [id(100), id(300), 0])).rejects.toThrow();
    await expect(asUser(1, sql, [id(100), id(300), 'NaN'])).rejects.toThrow();
    await asUser(1, sql, [id(100), id(300), 50]);
    await expect(asUser(1, sql, [id(100), id(300), 25])).rejects.toThrow();
  });
  it('rolls back the entire ingredient save if an allergen belongs to another organization', async () => {
    await asUser(2, "insert into public.allergens(id,name) values($1,'Milk')", [id(400)]);
    await expect(
      asUser(1, 'select public.save_ingredient($1::jsonb)', [
        JSON.stringify({
          name: 'Rollback',
          category: 'Dry',
          default_uom: 'lb',
          spanish_name: 'Prueba',
          allergen_ids: [id(400)],
        }),
      ]),
    ).rejects.toThrow();
    expect(
      (await asUser(1, "select * from public.ingredients where name='Rollback'")).rows,
    ).toHaveLength(0);
  });
  it('stores contextual worker feedback without exposing other submissions', async () => {
    await asUser(
      1,
      "insert into public.feedback_items(route,comment) values('/app/ingredients','Admin feedback')",
    );
    await asUser(
      3,
      "insert into public.feedback_items(route,comment) values('/worker','Necesito ayuda')",
    );
    expect((await asUser(3, 'select * from public.feedback_items')).rows).toHaveLength(1);
    await expect(
      asUser(
        3,
        "insert into public.feedback_items(route,comment,status) values('/worker','Bypass','Resolved')",
      ),
    ).rejects.toThrow();
    await expect(asUser(3, 'select * from public.login_event_user_names()'))
      .rejects.toThrow('Audit permission required');
    expect((await asUser(1, 'select * from public.feedback_items')).rows).toHaveLength(2);
  });
  it('rejects anonymous access', async () => {
    await db.exec('reset role; set role anon');
    await expect(db.query('select * from public.ingredients')).rejects.toThrow();
    await expect(db.query("select public.save_ingredient('{}'::jsonb)")).rejects.toThrow();
  });
  it('submits tenant-specific access requests without exposing requests publicly', async () => {
    await db.exec('reset role; set role anon');
    await expect(
      db.query(
        "insert into public.access_requests(organization_id,display_name,contact_kind,contact_value,preferred_locale) values($1,'Forged','email','forged@example.com','en')",
        [id(20)],
      ),
    ).rejects.toThrow();
    const resolved = await db.query(
      'select * from public.resolve_signup_organization($1)',
      [' A '],
    );
    expect(resolved.rows).toEqual([{ name: 'A', slug: 'a' }]);
    expect(
      (await db.query('select * from public.resolve_signup_organization($1)', ['missing'])).rows,
    ).toHaveLength(0);
    await db.exec('reset role');
    await db.query('update public.organizations set signup_enabled=false where id=$1', [id(20)]);
    await db.exec('set role anon');
    await expect(
      db.query(
        'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
        ['a', 'Malformed Contact', 'email', 'not-an-email', 'en', 'worker'],
      ),
    ).rejects.toMatchObject({ code: '22023' });
    expect(
      (await db.query('select * from public.resolve_signup_organization($1)', ['b'])).rows,
    ).toHaveLength(0);
    await expect(
      db.query(
        'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
        ['b', 'Disabled Tenant', 'email', 'disabled@example.com', 'en', 'worker'],
      ),
    ).rejects.toMatchObject({ code: 'P0002' });
    await db.exec('reset role');
    await db.query('update public.organizations set signup_enabled=true where id=$1', [id(20)]);
    await db.exec('set role anon');
    await db.query(
      'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
      ['a', 'New Person', 'email', 'new@example.com', 'en', 'worker'],
    );
    await db.query(
      'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
      ['b', 'Other Person', 'email', 'new@example.com', 'en', 'worker'],
    );
    await expect(
      db.query(
        'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
        ['missing', 'Unknown', 'email', 'unknown@example.com', 'en', 'worker'],
      ),
    ).rejects.toThrow('Signup link is invalid or unavailable');
    await expect(db.query('select * from public.access_requests')).rejects.toThrow();
    await db.exec('reset role');
    const administratorRequest = await asUser(
      1,
      "insert into public.access_requests(display_name,contact_kind,contact_value,preferred_locale) values('Admin Created','email','admin-created@example.com','en') returning organization_id",
    );
    expect(administratorRequest.rows).toEqual([{ organization_id: id(10) }]);
    await expect(
      asUser(
        1,
        "insert into public.access_requests(organization_id,display_name,contact_kind,contact_value,preferred_locale) values($1,'Cross Tenant','email','cross-tenant@example.com','en')",
        [id(20)],
      ),
    ).rejects.toThrow();
    expect(
      (
        await asUser(
          1,
          "select status from public.access_requests where contact_value='new@example.com'",
        )
      ).rows,
    ).toEqual([{ status: 'New' }]);
    expect(
      (
        await asUser(
          2,
          "select display_name from public.access_requests where contact_value='new@example.com'",
        )
      ).rows,
    ).toEqual([{ display_name: 'Other Person' }]);
    await asUser(
      1,
      "update public.access_requests set status='Contacted',reviewed_at=now(),reviewed_by=$1 where contact_value='new@example.com'",
      [id(1)],
    );
    expect(
      (
        await asUser(
          1,
          "select status from public.access_requests where contact_value='new@example.com'",
        )
      ).rows,
    ).toEqual([{ status: 'Contacted' }]);
    expect(
      (
        await asUser(
          2,
          "select status from public.access_requests where contact_value='new@example.com'",
        )
      ).rows,
    ).toEqual([{ status: 'New' }]);
    expect((await asUser(4, 'select * from public.access_requests')).rows).toHaveLength(0);
  });
  it('limits successful public signup requests per tenant without charging duplicates', async () => {
    await db.exec('reset role');
    await db.query(
      'insert into public.organizations(id,name,slug) values($1,$2,$3),($4,$5,$6)',
      [id(97), 'Rate limited tenant', 'rate-limited', id(98), 'Independent tenant', 'independent'],
    );
    await db.exec('set role anon');
    await db.query(
      'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
      ['rate-limited', 'Person 1', 'email', 'person-1@example.com', 'en', 'worker'],
    );
    await expect(
      db.query(
        'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
        ['rate-limited', 'Person 1 retry', 'email', 'person-1@example.com', 'en', 'worker'],
      ),
    ).rejects.toMatchObject({ code: '23505' });
    await db.query(
      `select public.submit_access_request(
         'rate-limited',
         'Person ' || request_number,
         'email',
         'person-' || request_number || '@example.com',
         'en',
         'worker'
       )
       from generate_series(2,10) request_number`,
    );
    await expect(
      db.query(
        'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
        ['rate-limited', 'Person 11', 'email', 'person-11@example.com', 'en', 'worker'],
      ),
    ).rejects.toMatchObject({
      code: 'P0001',
      message: 'Signup request limit reached; try again later',
    });
    await db.query(
      'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
      ['independent', 'Other tenant', 'email', 'other-tenant@example.com', 'en', 'worker'],
    );
    await expect(db.query('select * from public.signup_request_events')).rejects.toThrow();
    await db.exec('reset role');
    expect(
      (
        await db.query(
          'select count(*)::integer as count from public.signup_request_events where organization_id=$1',
          [id(97)],
        )
      ).rows,
    ).toEqual([{ count: 10 }]);
    expect(
      (
        await db.query(
          'select count(*)::integer as count from public.signup_request_events where organization_id=$1',
          [id(98)],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
    await db.query(
      `update public.signup_request_events
       set created_at=clock_timestamp() - interval '61 minutes'
       where access_request_id=(
         select id from public.access_requests
         where organization_id=$1 and contact_value='person-1@example.com'
       )`,
      [id(97)],
    );
    await db.exec('set role anon');
    await db.query(
      'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
      ['rate-limited', 'Person 11', 'email', 'person-11@example.com', 'en', 'worker'],
    );
  });
  it('lets an administrator approve a request into a non-admin role and facility', async () => {
    await db.exec('reset role; set role anon');
    await db.query(
      'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
      ['a', 'Invited Worker', 'email', 'worker@example.com', 'es', 'worker'],
    );
    await db.exec('reset role');
    const submittedRequest = await asUser(
      1,
      "select id from public.access_requests where contact_value='worker@example.com'",
    );
    const submittedRequestId = z.object({ id: z.uuid() }).parse(submittedRequest.rows[0]).id;
    const workerProfile = await asUser(
      1,
      "select id from public.access_profiles where name='Production Worker'",
    );
    await asUser(1, 'select public.approve_access_request($1,$2,$3,$4)', [
      submittedRequestId,
      id(7),
      id(11),
      z.object({ id: z.uuid() }).parse(workerProfile.rows[0]).id,
    ]);
    expect(
      (await asUser(7, 'select first_name,last_name,display_name,role,preferred_locale from public.profiles')).rows,
    ).toEqual([{
      first_name: 'Invited',
      last_name: 'Worker',
      display_name: 'Invited Worker',
      role: 'worker',
      preferred_locale: 'es',
    }]);
    await expect(
      asUser(1, 'select public.approve_access_request($1,$2,$3,$4)', [
        submittedRequestId,
        id(7),
        id(11),
        id(999),
      ]),
    ).rejects.toThrow();
  });
  it('rejects cross-organization access-request review and approval', async () => {
    await db.exec('reset role; set role anon');
    const submitted = await db.query<{ submit_access_request: string }>(
      'select public.submit_access_request($1,$2,$3,$4,$5,$6)',
      ['b', 'Tenant B Worker', 'email', 'tenant-b-worker@example.com', 'en', 'worker'],
    );
    const requestId = z
      .object({ submit_access_request: z.uuid() })
      .parse(submitted.rows[0]).submit_access_request;
    await db.exec('reset role');

    expect(
      (await asUser(1, 'select id from public.access_requests where id=$1', [requestId])).rows,
    ).toHaveLength(0);
    expect(
      (
        await asUser(
          1,
          "update public.access_requests set status='Declined',reviewed_at=now(),reviewed_by=$1 where id=$2 returning id",
          [id(1), requestId],
        )
      ).rows,
    ).toHaveLength(0);

    const tenantAWorkerProfile = await asUser(
      1,
      "select id from public.access_profiles where name='Production Worker'",
    );
    await expect(
      asUser(1, 'select public.approve_access_request($1,$2,$3,$4)', [
        requestId,
        id(9),
        id(11),
        z.object({ id: z.uuid() }).parse(tenantAWorkerProfile.rows[0]).id,
      ]),
    ).rejects.toThrow('Request cannot be approved');
  });
  it('posts a supplier receipt and one linked immutable inventory entry', async () => {
    const supplier = await asUser(
      1,
      "insert into public.suppliers(name) values('Receipt Supplier') returning id",
    );
    const payload = {
      supplier_id: z.object({ id: z.uuid() }).parse(supplier.rows[0]).id,
      ingredient_id: id(100),
      quantity: 12,
      uom: 'lb',
      received_on: '2026-09-19',
      supplier_reference: 'PO-12',
      supplier_lot: 'LOT-A',
      expiration_date: '2027-01-01',
      note: 'Dock delivery',
      request_id: id(900),
    };
    await asUser(6, 'select public.post_inventory_receipt($1::jsonb)', [JSON.stringify(payload)]);
    await asUser(6, 'select public.post_inventory_receipt($1::jsonb)', [JSON.stringify(payload)]);
    expect(
      (await asUser(6, 'select id from public.inventory_events where request_id=$1', [id(900)]))
        .rows,
    ).toHaveLength(1);
    await expect(
      asUser(6, 'select public.post_inventory_receipt($1::jsonb)', [
        JSON.stringify({ ...payload, quantity: 13 }),
      ]),
    ).rejects.toThrow('Request ID already used');
    await expect(
      asUser(6, 'select public.post_inventory_receipt($1::jsonb)', [
        JSON.stringify({ ...payload, quantity: 0.00001, request_id: id(901) }),
      ]),
    ).rejects.toThrow('four decimal places');

    expect(
      (
        await asUser(
          6,
          'select event_type,quantity_delta,receipt_line_id is not null as linked from public.inventory_events where request_id=$1',
          [id(900)],
        )
      ).rows,
    ).toEqual([{ event_type: 'Receipt', quantity_delta: '12.0000', linked: true }]);
    expect(
      (await asUser(6, 'select supplier_lot from public.inventory_receipt_lines')).rows,
    ).toEqual([{ supplier_lot: 'LOT-A' }]);
  });
});

describe('reference and receiver regression gates', () => {
  it('accepts receiver feedback without exposing other submissions', async () => {
    await asUser(
      6,
      "insert into public.feedback_items(route,comment) values('/receiving','Receipt feedback')",
    );
    expect(
      (await asUser(6, "select route from public.feedback_items where route='/receiving'")).rows,
    ).toHaveLength(1);
  });
  it('preserves stored reference codes and rejects custom fixed-list values', async () => {
    await expect(
      asUser(
        1,
        "update public.reference_options set code='changed' where list_code='ingredient_category' and code='Dry'",
      ),
    ).rejects.toThrow('Reference codes');
    await expect(
      asUser(
        1,
        "insert into public.reference_options(organization_id,list_code,code,label_en,label_es) values($1,'base_uom','custom','Custom','Custom')",
        [id(10)],
      ),
    ).rejects.toThrow();
  });
});

describe('restored recipe schema invariants', () => {
  it('requires complete drafts and preserves released recipe content', async () => {
    await asUser(1, "insert into public.products(id,name) values($1,'Test recipe product')", [
      id(1000),
    ]);
    await asUser(1, "insert into public.recipes(id,product_id,name) values($1,$2,'Test recipe')", [
      id(1001),
      id(1000),
    ]);
    await asUser(
      1,
      'insert into public.recipe_versions(id,recipe_id,version_number) values($1,$2,1)',
      [id(1002), id(1001)],
    );
    await expect(
      asUser(1, "update public.recipe_versions set status='Released',released_by=$1 where id=$2", [
        id(1),
        id(1002),
      ]),
    ).rejects.toThrow('empty recipe');
    await expect(
      asUser(1, 'update public.recipes set active_version_id=$1 where id=$2', [id(1002), id(1001)]),
    ).rejects.toThrow('must be Released');
    await asUser(
      1,
      "insert into public.recipe_sections(id,recipe_version_id,name,sequence) values($1,$2,'Main',1)",
      [id(1003), id(1002)],
    );
    await asUser(
      1,
      `insert into public.recipe_lines(id,recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
      values($1,$2,$3,$4,'test',1,'1 lb',1,'lb')`,
      [id(1004), id(1002), id(1003), id(100)],
    );
    await asUser(
      1,
      "update public.recipe_versions set status='Released',released_by=$1 where id=$2",
      [id(1), id(1002)],
    );
    await asUser(1, 'update public.recipes set active_version_id=$1 where id=$2', [
      id(1002),
      id(1001),
    ]);
    await expect(
      asUser(1, 'update public.recipe_lines set normalized_quantity=2 where id=$1', [id(1004)]),
    ).rejects.toThrow('immutable');
    await expect(
      asUser(1, 'update public.recipe_versions set target_yield_gallons=80 where id=$1', [
        id(1002),
      ]),
    ).rejects.toThrow('immutable');
    expect((await asUser(2, 'select id from public.recipe_versions')).rows).toEqual([]);
    expect((await asUser(3, 'select id from public.recipe_versions')).rows).toEqual([]);
    expect((await asUser(4, 'select id from public.recipe_versions')).rows).toEqual([
      { id: id(1002) },
    ]);
  });
});

describe('user management database foundation', () => {
  it('backfills canonical names and enforces organization-scoped work emails', async () => {
    expect(
      (await asUser(1, 'select first_name,last_name,display_name from public.profiles where id=$1', [
        id(3),
      ])).rows,
    ).toEqual([{ first_name: 'Worker', last_name: 'A', display_name: 'Worker A' }]);
    expect(
      (await asUser(1, 'select first_name,last_name,display_name from public.profiles where id=$1', [
        id(9),
      ])).rows,
    ).toEqual([{ first_name: 'Unknown', last_name: '-', display_name: '   ' }]);
    const longLegacyName = z.object({
      first_name: z.string(),
      last_name: z.string(),
      display_name: z.string(),
    }).parse((await asUser(
      1,
      'select first_name,last_name,display_name from public.profiles where id=$1',
      [id(30)],
    )).rows[0]);
    expect(longLegacyName).toMatchObject({ first_name: 'First' });
    expect(longLegacyName.last_name).toHaveLength(100);
    expect(longLegacyName.display_name).toHaveLength(156);

    await db.exec('reset role');
    await db.query('insert into auth.users values($1)', [id(31)]);
    const reviewerProfile = await db.query<{ id: string }>(
      "select id from public.access_profiles where organization_id=$1 and name='Operations Reviewer'",
      [id(10)],
    );
    await db.query(
      `insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
       values($1,$2,$3,'   ','reviewer',$4)`,
      [id(31), id(10), id(11), reviewerProfile.rows[0]?.id],
    );
    expect(
      (await db.query('select first_name,last_name from public.profiles where id=$1', [id(31)])).rows,
    ).toEqual([{ first_name: 'Unknown', last_name: '-' }]);

    await db.query('update public.profiles set work_email=$1 where id in ($2,$3)', [
      'ADMIN@EXAMPLE.COM',
      id(1),
      id(2),
    ]);
    expect(
      (await db.query('select work_email from public.profiles where id=$1', [id(1)])).rows,
    ).toEqual([{ work_email: 'admin@example.com' }]);
    await expect(
      db.query('update public.profiles set work_email=$1 where id=$2', [
        'admin@example.com',
        id(5),
      ]),
    ).rejects.toThrow();

    const indexes = await db.query<{ indexdef: string; indexname: string }>(
      "select indexname,indexdef from pg_indexes where schemaname='public' and tablename='profiles' and indexname like 'profiles_org_name_%' order by indexname",
    );
    expect(indexes.rows.map(({ indexname }) => indexname)).toEqual([
      'profiles_org_name_search',
      'profiles_org_name_sort',
    ]);
    expect(indexes.rows.find(({ indexname }) => indexname === 'profiles_org_name_sort')?.indexdef)
      .toContain('(organization_id, last_name, first_name, id)');
    expect(indexes.rows.find(({ indexname }) => indexname === 'profiles_org_name_search')?.indexdef)
      .toContain('text_pattern_ops');
  });

  it('keeps login history append-only and isolated to organization audit readers', async () => {
    await db.exec('reset role');
    await db.query(
      `insert into public.access_profiles(id,organization_id,name,description,base_role,is_system)
       values($1,$2,'Audit Reader','Login audit access only','reviewer',false)`,
      [id(810), id(10)],
    );
    await db.query(
      `insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
       values($1,$2,'audit.read')`,
      [id(10), id(810)],
    );
    await db.query('update public.profiles set access_profile_id=$1 where id=$2', [id(810), id(8)]);

    await asUser(
      3,
      "insert into public.login_events(event_type,user_agent) values('signed_in','database test')",
    );
    await asUser(
      9,
      "insert into public.login_events(event_type,user_agent) values('signed_in','legacy blank name')",
    );
    await expect(
      asUser(
        3,
        'insert into public.login_events(organization_id,user_id,event_type) values($1,$2,$3)',
        [id(20), id(2), 'signed_in'],
      ),
    ).rejects.toThrow();
    expect((await asUser(3, 'select id from public.login_events')).rows).toEqual([]);
    expect(
      (await asUser(1, 'select user_id,event_type from public.login_events order by user_id')).rows,
    ).toEqual([
      { user_id: id(3), event_type: 'signed_in' },
      { user_id: id(9), event_type: 'signed_in' },
    ]);
    expect((await asUser(8, 'select display_name from public.profiles where id=$1', [id(3)])).rows)
      .toEqual([]);
    expect((await asUser(8, 'select * from public.login_event_user_names()')).rows).toEqual([
      { user_id: id(9), display_name: 'Unknown' },
      { user_id: id(3), display_name: 'Worker A' },
    ]);
    expect(
      (await asUser(8, 'select * from public.login_event_user_names() where user_id=$1', [id(2)]))
        .rows,
    ).toEqual([]);
    expect((await asUser(2, 'select id from public.login_events')).rows).toEqual([]);
    await expect(
      asUser(1, "update public.login_events set event_type='signed_out'"),
    ).rejects.toThrow();
    await expect(asUser(1, 'delete from public.login_events')).rejects.toThrow();
  });

  it('deactivates access transactionally without crossing organizations or deleting auth users', async () => {
    await expect(
      asUser(1, 'select public.deactivate_user_access($1,$2)', [id(1), 'Self removal']),
    ).rejects.toThrow('cannot deactivate your own access');
    await expect(
      asUser(1, 'select public.deactivate_user_access($1,$2)', [id(2), 'Wrong company']),
    ).rejects.toThrow('must belong to your organization');

    await asUser(1, 'select public.deactivate_user_access($1,$2)', [
      id(6),
      'Employment ended',
    ]);
    expect((await asUser(6, 'select id from public.profiles')).rows).toEqual([]);

    await db.exec('reset role');
    expect(
      (
        await db.query(
          'select active,deactivated_by,deactivation_reason from public.profiles where id=$1',
          [id(6)],
        )
      ).rows,
    ).toEqual([
      { active: false, deactivated_by: id(1), deactivation_reason: 'Employment ended' },
    ]);
    expect((await db.query('select id from auth.users where id=$1', [id(6)])).rows).toEqual([
      { id: id(6) },
    ]);
    expect(
      (
        await db.query(
          "select actor_user_id,event_type from public.audit_events where entity_id=$1 and event_type='USER_ACCESS_DEACTIVATED'",
          [id(6)],
        )
      ).rows,
    ).toEqual([{ actor_user_id: id(1), event_type: 'USER_ACCESS_DEACTIVATED' }]);

    await asUser(1, 'select public.deactivate_user_access($1,$2)', [
      id(5),
      'Reduce duplicate administration',
    ]);
    expect(
      (
        await asUser(
          1,
          `select count(*)::int as count
           from public.profiles p
           join public.access_profile_permissions app
             on app.access_profile_id=p.access_profile_id
           where p.organization_id=$1 and p.active and app.permission_code='access.manage'`,
          [id(10)],
        )
      ).rows,
    ).toEqual([{ count: 1 }]);
  });

  it('changes an organization user from reviewer to administrator through the audited RPC', async () => {
    const administrator = z.object({ id: z.string() }).parse((
      await asUser(
        1,
        "select id from public.access_profiles where organization_id=$1 and name='Administrator'",
        [id(10)],
      )
    ).rows[0]);

    await asUser(1, 'select public.change_user_access_profile($1,$2)', [id(4), administrator.id]);

    await db.exec('reset role');
    expect((await db.query('select role,access_profile_id from public.profiles where id=$1', [id(4)])).rows)
      .toEqual([{ role: 'admin', access_profile_id: administrator.id }]);
    expect(
      (await db.query(
        "select actor_user_id,event_type from public.audit_events where entity_id=$1 and event_type='USER_ACCESS_PROFILE_CHANGED'",
        [id(4)],
      )).rows,
    ).toEqual([{ actor_user_id: id(1), event_type: 'USER_ACCESS_PROFILE_CHANGED' }]);
  });

  it('does not remove access.manage from the last active access-manager profile', async () => {
    const administrator = z.object({ id: z.string() }).parse((
      await asUser(
        1,
        "select id from public.access_profiles where organization_id=$1 and name='Administrator'",
        [id(10)],
      )
    ).rows[0]);

    await expect(asUser(1, 'select public.save_access_profile($1::jsonb)', [JSON.stringify({
      id: administrator.id,
      name: 'Administrator',
      description: 'Full system administration',
      base_role: 'admin',
      active: true,
      permission_codes: ['settings.manage'],
    })])).rejects.toThrow('last active access manager cannot lose access management permission');

    await db.exec('reset role');
    expect((await db.query(
      "select permission_code from public.access_profile_permissions where access_profile_id=$1 and permission_code='access.manage'",
      [administrator.id],
    )).rows).toEqual([{ permission_code: 'access.manage' }]);
  });
});
