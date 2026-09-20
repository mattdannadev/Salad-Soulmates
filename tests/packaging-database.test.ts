import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  beforeAll, beforeEach, afterAll, afterEach, expect, it,
} from 'vitest';
import { initializeGateDatabase, gateActor } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;
async function query(sql: string, parameters: unknown[] = []) {
  await database.exec('savepoint expected_failure');
  try {
    const result = await database.query(sql, parameters);
    await database.exec('release savepoint expected_failure');
    return result;
  } catch (error) {
    await database.exec('rollback to savepoint expected_failure; release savepoint expected_failure');
    throw error;
  }
}
async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
}
const input = (overrides = {}) => ({
  id: id(700),
  product_id: id(300),
  expected_version: 0,
  status: 'Draft',
  bag_size_gallons: 1,
  bags_per_case: 4,
  label_width_inches: 3,
  label_height_inches: 5,
  display_name: 'Synthetic dressing',
  ingredient_statement: '',
  ...overrides,
});
const save = (payload: unknown) => query('select public.save_packaging_profile($1::jsonb) as id', [JSON.stringify(payload)]);
beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await database.exec(`
    insert into auth.users values('${id(2)}'),('${id(3)}'),('${id(4)}');
    insert into public.organizations(id,name,slug) values('${id(20)}','Other','other');
    insert into public.facilities(id,organization_id,name) values('${id(12)}','${id(10)}','Second facility'),('${id(21)}','${id(20)}','Other');
    insert into public.access_profiles(id,organization_id,name,base_role) values('${id(22)}','${id(20)}','Other administrator','admin');
    insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
      select '${id(20)}','${id(22)}',code from public.permissions;
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(2)}','${id(10)}','${id(11)}','Reviewer','reviewer',id from public.access_profiles where name='Operations Reviewer';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(3)}','${id(10)}','${id(12)}','Second admin','admin',id from public.access_profiles where name='Administrator';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      values('${id(4)}','${id(20)}','${id(21)}','Other admin','admin','${id(22)}');
  `);
  await actAs(gateActor);
  await database.exec(`
    insert into public.products(id,name) values('${id(300)}','Synthetic dressing');
    insert into public.ingredients(id,name,default_uom) values('${id(100)}','Synthetic garlic','lb');
    insert into public.recipes(id,product_id,name) values('${id(400)}','${id(300)}','Synthetic recipe');
    insert into public.recipe_versions(id,recipe_id,version_number) values('${id(401)}','${id(400)}',1);
    insert into public.recipe_sections(id,recipe_version_id,name,sequence) values('${id(402)}','${id(401)}','Ingredients',1);
    insert into public.recipe_lines(recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
      values('${id(401)}','${id(402)}','${id(100)}','TEST',1,'1 lb',1,'lb');
    update public.recipe_versions set status='Released',released_by='${gateActor}' where id='${id(401)}';
    update public.recipes set active_version_id='${id(401)}' where id='${id(400)}';
  `);
}, 60000);
beforeEach(async () => {
  await database.exec('begin');
  await actAs(gateActor);
});
afterEach(async () => {
  await database.exec('rollback');
});
afterAll(async () => {
  await database.close();
});

it('saves drafts without changing product defaults or inventory and retries only identical requests', async () => {
  await save(input({ bag_size_gallons: 2 }));
  await save(input({ bag_size_gallons: 2 }));
  expect((await query('select count(*)::int as count from public.packaging_profile_versions')).rows).toEqual([{ count: 1 }]);
  expect((await query('select bag_size_gallons::float as gallons from public.products')).rows).toEqual([{ gallons: 1 }]);
  expect((await query('select count(*)::int as count from public.inventory_events')).rows).toEqual([{ count: 0 }]);
  await expect(save(input({ bag_size_gallons: 3 }))).rejects.toThrow('request already used');
});
it('approves controlled content, copies defaults atomically and preserves immutable versions', async () => {
  await save(input());
  await save(input({
    id: id(701), expected_version: 1, status: 'Approved', bag_size_gallons: 2, ingredient_statement: 'Approved wording',
  }));
  expect((await query('select bag_size_gallons::float as gallons,approved_ingredient_statement as statement from public.products')).rows).toEqual([{ gallons: 2, statement: 'Approved wording' }]);
  expect((await query("select approved_by,labels_per_bag,template_key from public.packaging_profile_versions where status='Approved'")).rows).toEqual([{ approved_by: gateActor, labels_per_bag: 1, template_key: 'bag-label-v1' }]);
  await save(input({
    id: id(702), expected_version: 2, label_width_inches: 4, label_height_inches: 6,
  }));
  expect((await query("select label_width_inches::float as width,label_height_inches::float as height from public.packaging_profile_versions where status='Approved'")).rows).toEqual([{ width: 3, height: 5 }]);
  await expect(query("update public.packaging_profile_versions set display_name='Tampered'")).rejects.toThrow('permission denied');
  await expect(query('delete from public.packaging_profile_versions')).rejects.toThrow('permission denied');
});
it('rejects stale edits and allows identical retries after a newer version', async () => {
  await save(input());
  await save(input({ id: id(701), expected_version: 1 }));
  await save(input());
  await expect(save(input({ id: id(702) }))).rejects.toThrow('Packaging setup changed');
});
it.each([
  { status: 'Approved', ingredient_statement: '   ' },
  { bag_size_gallons: 0 }, { bag_size_gallons: 1.00001 }, { bags_per_case: 0 },
  { label_width_inches: 0 }, { label_height_inches: 13 }, { label_width_inches: 3.001 },
  { display_name: ' ' }, { status: 'Unexpected' }, { expected_version: null },
])('validates malformed direct RPC input %j', async (override) => {
  await expect(save(input(override))).rejects.toThrow();
  expect((await query('select count(*)::int as count from public.packaging_profile_versions')).rows).toEqual([{ count: 0 }]);
});
it('rejects missing/inactive products and direct-insert version or actor tampering', async () => {
  await expect(save(input({ product_id: id(999) }))).rejects.toThrow('Choose an active product');
  await query('update public.products set active=false');
  await expect(save(input())).rejects.toThrow('Choose an active product');
  await query('update public.products set active=true');
  await expect(query(`insert into public.packaging_profile_versions(id,product_id,version,status,bag_size_gallons,bags_per_case,display_name)
    values('${id(700)}','${id(300)}',5,'Draft',1,4,'Name')`)).rejects.toThrow('Packaging setup changed');
  await query(`insert into public.packaging_profile_versions(id,product_id,version,status,bag_size_gallons,bags_per_case,display_name,created_by,created_at)
    values('${id(700)}','${id(300)}',1,'Draft',1,4,'Name','${id(2)}','2000-01-01')`);
  expect((await query('select created_by from public.packaging_profile_versions')).rows).toEqual([{ created_by: gateActor }]);
});
it('enforces organization and permission boundaries; product setup is shared within an organization', async () => {
  await save(input());
  await actAs(id(2));
  expect((await query('select count(*)::int as count from public.packaging_profile_versions')).rows).toEqual([{ count: 1 }]);
  await expect(save(input({ id: id(701), expected_version: 1 }))).rejects.toThrow('permission required');
  await actAs(id(4));
  expect((await query('select * from public.packaging_profile_versions')).rows).toEqual([]);
  await expect(save(input({ id: id(701), expected_version: 1 }))).rejects.toThrow('Choose an active product');
  await actAs(id(3));
  await save(input({ id: id(701), expected_version: 1 }));
  await database.exec('reset role; set role anon');
  await expect(save(input())).rejects.toThrow('permission denied');
});
it('keeps saved order packaging snapshots after approval while future orders use new defaults', async () => {
  const order = {
    id: id(800), customer_name: 'Synthetic customer', reference: '', needed_on: '2026-10-01', products: [{ product_id: id(300), batch_count: 1, customer_product_option_id: null }],
  };
  await query('select public.save_customer_order($1::jsonb)', [JSON.stringify(order)]);
  const before = await query('select to_jsonb(o) as snapshot from public.customer_orders o');
  await save(input({ status: 'Approved', bag_size_gallons: 2, ingredient_statement: 'Approved wording' }));
  expect((await query('select to_jsonb(o) as snapshot from public.customer_orders o')).rows).toEqual(before.rows);
  await query('select public.save_customer_order($1::jsonb)', [JSON.stringify({ ...order, id: id(801) })]);
  const result = await query('select items from public.customer_orders where id=$1', [id(801)]);
  const products = z.object({
    items: z.array(z.object({ gallons_per_unit: z.number(), unit_count: z.number() })),
  }).parse(result.rows[0]);
  expect(products.items[0]).toMatchObject({ gallons_per_unit: 8, unit_count: 5 });
});
