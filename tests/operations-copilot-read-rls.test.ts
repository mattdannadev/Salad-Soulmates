import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;

async function readAs(actor: string | null, table: 'recipes' | 'customer_orders') {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ?? '']);
  await database.exec('set role authenticated');
  return database.query<{ id: string }>(`select id from public.${table} order by id`);
}

beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await database.exec('reset role');
  await database.query(
    `insert into auth.users(id,email) values
      ($1,'other-facility@example.test'),($2,'other-org@example.test'),
      ($3,'no-orders@example.test'),($4,'no-products@example.test')`,
    [id(2), id(3), id(4), id(5)],
  );
  await database.exec(`
    insert into public.organizations(id,name,slug)
      values('${id(20)}','Other organization','copilot-other-organization');
    insert into public.facilities(id,organization_id,name) values
      ('${id(12)}','${id(10)}','Other facility'),
      ('${id(21)}','${id(20)}','Other organization facility');
    insert into public.access_profiles(id,organization_id,name,base_role) values
      ('${id(24)}','${id(10)}','No orders','worker'),
      ('${id(25)}','${id(10)}','No products admin','admin'),
      ('${id(26)}','${id(20)}','Other organization administrator','admin');
    insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
      values('${id(10)}','${id(24)}','products.read'),
            ('${id(20)}','${id(26)}','orders.read'),
            ('${id(20)}','${id(26)}','products.read');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id) values
      ('${id(2)}','${id(10)}','${id(12)}','Other facility','admin',
        (select id from public.access_profiles where organization_id='${id(10)}' and name='Administrator')),
      ('${id(3)}','${id(20)}','${id(21)}','Other organization','admin','${id(26)}'),
      ('${id(4)}','${id(10)}','${id(11)}','No orders','worker','${id(24)}'),
      ('${id(5)}','${id(10)}','${id(11)}','No products admin','admin','${id(25)}');
    insert into public.products(id,organization_id,name) values
      ('${id(100)}','${id(10)}','Local product'),
      ('${id(200)}','${id(20)}','Outside product');
    insert into public.recipes(id,organization_id,product_id,name) values
      ('${id(101)}','${id(10)}','${id(100)}','Local recipe'),
      ('${id(201)}','${id(20)}','${id(200)}','Outside recipe');
    insert into public.customers(id,organization_id,name) values
      ('${id(110)}','${id(10)}','Local customer'),
      ('${id(210)}','${id(20)}','Outside customer');
    alter table public.material_plans disable trigger material_plan_guard;
    insert into public.material_plans(id,organization_id,facility_id,name,needed_on,batches,created_by) values
      ('${id(120)}','${id(10)}','${id(11)}','Local plan','2026-10-01','[]','${gateActor}'),
      ('${id(121)}','${id(10)}','${id(12)}','Other facility plan','2026-10-01','[]','${gateActor}'),
      ('${id(220)}','${id(20)}','${id(21)}','Outside plan','2026-10-01','[]','${id(3)}');
    alter table public.material_plans enable trigger material_plan_guard;
    alter table public.customer_orders disable trigger customer_order_guard;
    insert into public.customer_orders
      (id,organization_id,facility_id,customer_id,customer_name,needed_on,products,created_by)
      values
      ('${id(120)}','${id(10)}','${id(11)}','${id(110)}','Local customer','2026-10-01','[]','${gateActor}'),
      ('${id(121)}','${id(10)}','${id(12)}','${id(110)}','Local customer','2026-10-01','[]','${id(2)}'),
      ('${id(220)}','${id(20)}','${id(21)}','${id(210)}','Outside customer','2026-10-01','[]','${id(3)}');
    alter table public.customer_orders enable trigger customer_order_guard;
  `);
});

afterAll(async () => {
  await database?.close();
});

describe('Operations Copilot direct recipe and order reads', () => {
  it('rejects anonymous table access before evaluating row policies', async () => {
    await database.exec('reset role; set role anon');
    await expect(database.query('select id from public.recipes')).rejects.toThrow('permission denied');
    await expect(database.query('select id from public.customer_orders')).rejects.toThrow('permission denied');
  });

  it('returns no rows to authenticated sessions without an identity', async () => {
    expect((await readAs(null, 'recipes')).rows).toEqual([]);
    expect((await readAs(null, 'customer_orders')).rows).toEqual([]);
  });

  it('isolates recipes by organization and products.read permission', async () => {
    expect((await readAs(gateActor, 'recipes')).rows).toEqual([{ id: id(101) }]);
    expect((await readAs(id(3), 'recipes')).rows).toEqual([{ id: id(201) }]);
    expect((await readAs(id(4), 'recipes')).rows).toEqual([{ id: id(101) }]);
    expect((await readAs(id(5), 'recipes')).rows).toEqual([]);
  });

  it('isolates orders by organization, facility, and orders.read permission', async () => {
    expect((await readAs(gateActor, 'customer_orders')).rows).toEqual([{ id: id(120) }]);
    expect((await readAs(id(2), 'customer_orders')).rows).toEqual([{ id: id(121) }]);
    expect((await readAs(id(3), 'customer_orders')).rows).toEqual([{ id: id(220) }]);
    expect((await readAs(id(4), 'customer_orders')).rows).toEqual([]);
  });

  it('denies inactive profiles even when their access profile has read permissions', async () => {
    await database.exec('reset role');
    await database.query('update public.profiles set active=false where id=$1', [id(2)]);
    expect((await readAs(id(2), 'recipes')).rows).toEqual([]);
    expect((await readAs(id(2), 'customer_orders')).rows).toEqual([]);
  });

  it('requires products.read for recipes even for an administrator role', async () => {
    expect((await readAs(id(5), 'recipes')).rows).toEqual([]);
    expect((await readAs(id(5), 'customer_orders')).rows).toEqual([]);
  });
});
