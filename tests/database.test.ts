import { PGlite } from '@electric-sql/pglite';
import { readFileSync } from 'node:fs';
import { beforeAll, afterAll, describe, it, expect } from 'vitest';

const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
async function asUser(user: number, sql: string, params: unknown[] = []) {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(user)]);
  await db.exec('set role authenticated');
  return db.query(sql, params);
}
beforeAll(async () => {
  db = new PGlite();
  await db.exec(`create role authenticated; create role anon; create schema auth;
 create table auth.users(id uuid primary key);
 create function auth.uid() returns uuid language sql stable as $$select nullif(current_setting('request.jwt.claim.sub',true),'')::uuid$$;
 grant usage on schema auth to authenticated,anon;
 grant execute on function auth.uid() to authenticated,anon;`);
  await db.exec(readFileSync('supabase/migrations/202609180001_foundation.sql', 'utf8'));
  await db.exec(readFileSync('supabase/migrations/202609180003_access_requests.sql', 'utf8'));
  await db.exec(
    readFileSync('supabase/migrations/20260919154002_access_approval_workflow.sql', 'utf8'),
  );
  await db.exec(readFileSync('supabase/migrations/20260919154004_receiving_workflow.sql', 'utf8'));
  await db.exec(`insert into auth.users values('${id(1)}'),('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}'),('${id(6)}'),('${id(7)}');
 insert into public.organizations(id,name,slug) values('${id(10)}','A','a'),('${id(20)}','B','b');
 insert into public.facilities(id,organization_id,name) values('${id(11)}','${id(10)}','A'),('${id(21)}','${id(20)}','B'),('${id(12)}','${id(10)}','A2');
 insert into public.profiles(id,organization_id,facility_id,display_name,role) values
 ('${id(1)}','${id(10)}','${id(11)}','Admin A','admin'),('${id(2)}','${id(20)}','${id(21)}','Admin B','admin'),
 ('${id(3)}','${id(10)}','${id(11)}','Worker A','worker'),('${id(4)}','${id(10)}','${id(11)}','Reviewer A','reviewer'),
 ('${id(5)}','${id(10)}','${id(12)}','Admin A2','admin'),('${id(6)}','${id(10)}','${id(11)}','Receiver A','receiver');`);
  await db.exec(
    readFileSync(
      'supabase/migrations/20260919155843_permissions_and_reference_options.sql',
      'utf8',
    ),
  );
  await db.exec(
    readFileSync('supabase/migrations/20260919170000_harden_function_grants.sql', 'utf8'),
  );
});
afterAll(async () => {
  await db?.close();
});
describe('foundation migration against PostgreSQL (PGlite)', () => {
  it('has RLS on all twenty application tables', async () => {
    const result = await db.query<{ relrowsecurity: boolean }>(
      "select relrowsecurity from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and relkind='r'",
    );
    expect(result.rows).toHaveLength(20);
    expect(result.rows.every((r) => r.relrowsecurity)).toBe(true);
  });
  it('does not expose security-definer trigger helpers for direct execution', async () => {
    const result = await db.query<{ grantee: string; routine_name: string }>(
      `select grantee,routine_name from information_schema.routine_privileges
       where specific_schema='public' and routine_name in ('audit_change','guard_ingredient_unit')
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
  it('prevents self-promotion or changing organization membership', async () => {
    await expect(
      asUser(3, "update public.profiles set role='admin' where id=$1", [id(3)]),
    ).rejects.toThrow();
  });
  it('audits ledger entries, prevents duplicate submits and preserves history', async () => {
    const sql =
      "insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id) values($1,'OpeningBalance',25,'lb','Test opening balance',$2)";
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
  it('requires reasons, matching units, positive openings, and authentic actors', async () => {
    for (const [qty, uom, reason, actor] of [
      [1, 'gal', 'Wrong unit', id(1)],
      [1, 'lb', '', id(1)],
      [-1, 'lb', 'Bad opening', id(1)],
      [1, 'lb', 'Forged actor', id(2)],
    ]) {
      await expect(
        asUser(
          1,
          "insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id,created_by) values($1,'OpeningBalance',$2,$3,$4,gen_random_uuid(),$5)",
          [id(100), qty, uom, reason, actor],
        ),
      ).rejects.toThrow();
    }
  });
  it('locks ingredient units even when history belongs to another facility', async () => {
    await expect(
      asUser(5, "update public.ingredients set default_uom='gal' where id=$1", [id(100)]),
    ).rejects.toThrow('Base unit cannot change');
  });
  it('enforces pack size, preferred-pack uniqueness and tenant-safe relationships', async () => {
    await asUser(1, "insert into public.suppliers(id,name) values($1,'Supplier A')", [id(300)]);
    await asUser(2, "insert into public.suppliers(id,name) values($1,'Supplier B')", [id(301)]);
    const sql =
      "insert into public.supplier_items(ingredient_id,supplier_id,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred) values($1,$2,'bag',$3,'lb',true)";
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
    expect((await asUser(1, 'select * from public.feedback_items')).rows).toHaveLength(2);
  });
  it('rejects anonymous access', async () => {
    await db.exec('reset role; set role anon');
    await expect(db.query('select * from public.ingredients')).rejects.toThrow();
    await expect(db.query("select public.save_ingredient('{}'::jsonb)")).rejects.toThrow();
  });
  it('accepts a pending access request without exposing requests publicly', async () => {
    await db.exec('reset role; set role anon');
    await db.query(
      "insert into public.access_requests(display_name,contact_kind,contact_value,preferred_locale) values('New Person','email','new@example.com','en')",
    );
    await expect(db.query('select * from public.access_requests')).rejects.toThrow();
    await db.exec('reset role');
    expect(
      (
        await asUser(
          1,
          "select status from public.access_requests where contact_value='new@example.com'",
        )
      ).rows,
    ).toEqual([{ status: 'New' }]);
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
    expect((await asUser(4, 'select * from public.access_requests')).rows).toHaveLength(0);
  });
  it('lets an administrator approve a request into a non-admin role and facility', async () => {
    await db.exec('reset role; set role anon');
    const requestId = id(800);
    await db.query(
      "insert into public.access_requests(id,display_name,contact_kind,contact_value,preferred_locale,requested_role) values($1,'Invited Worker','email','worker@example.com','es','worker')",
      [requestId],
    );
    await db.exec('reset role');
    const workerProfile = await asUser(
      1,
      "select id from public.access_profiles where name='Production Worker'",
    );
    await asUser(1, 'select public.approve_access_request($1,$2,$3,$4)', [
      requestId,
      id(7),
      id(11),
      (workerProfile.rows[0] as { id: string }).id,
    ]);
    expect(
      (await asUser(7, 'select display_name,role,preferred_locale from public.profiles')).rows,
    ).toEqual([{ display_name: 'Invited Worker', role: 'worker', preferred_locale: 'es' }]);
    await expect(
      asUser(1, 'select public.approve_access_request($1,$2,$3,$4)', [
        requestId,
        id(7),
        id(11),
        id(999),
      ]),
    ).rejects.toThrow();
  });
  it('posts a supplier receipt and one linked immutable inventory entry', async () => {
    const supplier = await asUser(
      1,
      "insert into public.suppliers(name) values('Receipt Supplier') returning id",
    );
    const payload = {
      supplier_id: (supplier.rows[0] as { id: string }).id,
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
