import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  beforeAll, beforeEach, afterEach, afterAll, expect, it,
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
    await database.exec(
      'rollback to savepoint expected_failure; release savepoint expected_failure',
    );
    throw error;
  }
}
async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
}

async function rpc(name: 'save_customer_order' | 'save_order_production_plan' | 'post_inventory_receipt' | 'create_purchase_draft' | 'change_purchase_status', payload: unknown) {
  return query(`select public.${name}($1::jsonb) as id`, [JSON.stringify(payload)]);
}
async function assignLot(productId = id(300), assignedOn = '2026-09-18') {
  return query('select public.assign_production_lot($1::jsonb) as id', [JSON.stringify({
    order_id: id(800), product_id: productId, assigned_on: assignedOn,
  })]);
}
beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await database.exec(`
    insert into auth.users values('${id(2)}'),('${id(3)}'),('${id(4)}');
    insert into public.facilities(id,organization_id,name) values('${id(12)}','${id(10)}','Other facility');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
    select '${id(2)}','${id(10)}','${id(11)}','Reviewer','reviewer',id from public.access_profiles where name='Operations Reviewer';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
    select '${id(3)}','${id(10)}','${id(11)}','Receiver','receiver',id from public.access_profiles where name='Receiver';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
    select '${id(4)}','${id(10)}','${id(12)}','Other facility admin','admin',id from public.access_profiles where name='Administrator';
  `);
  await actAs(gateActor);
  await database.exec(`
    insert into public.ingredients(id,name,default_uom) values('${id(100)}','Synthetic garlic','lb');
    insert into public.suppliers(id,name) values('${id(200)}','Synthetic supplier');
    insert into public.supplier_items(id,supplier_id,ingredient_id,purchase_uom,pack_quantity,pack_quantity_uom,is_preferred)
      values('${id(201)}','${id(200)}','${id(100)}','pail',30,'lb',true);
    insert into public.products(id,name) values('${id(300)}','Synthetic dressing');
    insert into public.recipes(id,product_id,name) values('${id(400)}','${id(300)}','Synthetic formula');
    insert into public.recipe_versions(id,recipe_id,version_number) values('${id(401)}','${id(400)}',1);
    insert into public.recipe_sections(id,recipe_version_id,name,sequence) values('${id(402)}','${id(401)}','Ingredients',1);
    insert into public.recipe_lines(recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
      values('${id(401)}','${id(402)}','${id(100)}','TEST-1',1,'10 lb',10,'lb');
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

const orderInput = (orderId = id(800), count = 4) => ({
  id: orderId,
  customer_name: 'Synthetic customer',
  reference: 'CUSTOMER-123',
  needed_on: '2026-10-01',
  products: [{ product_id: id(300), batch_count: count, customer_product_option_id: null }],
});

const productionInput = (revision = 0) => ({
  id: id(800),
  revision,
  start_on: '2026-09-28',
  finish_on: '2026-09-30',
  status: 'Draft',
  note: '',
  shortage_reason: '',
});
async function prepareOrder() {
  await rpc('save_customer_order', orderInput());
}
async function counts() {
  const result = await query(`select
    (select count(*)::int from public.planned_mixer_batches) batches,
    (select count(*)::int from public.planned_spice_preparations) preparations,
    (select count(*)::int from public.inventory_events) events`);
  return z.object({
    batches: z.number(), preparations: z.number(), events: z.number(),
  }).parse(result.rows[0]);
}
it('creates exactly one spice preparation per mixer batch, with no physical inventory posting', async () => {
  await prepareOrder();
  await rpc('save_order_production_plan', productionInput());
  expect(await counts()).toEqual({ batches: 4, preparations: 4, events: 0 });
  const result = await query('select public.order_production_batches($1) batches', [id(800)]);
  const batchRows = z.object({
    batches: z.array(z.object({
      recipe_version_id: z.literal(id(401)),
      target_gallons: z.literal(40),
      spice_preparation_id: z.uuid(),
    })),
  }).parse(result.rows[0]);
  expect(batchRows.batches).toHaveLength(4);
});
it('assigns a product-specific DDDYY lot to every existing mixer/spice pair without consumption', async () => {
  await prepareOrder();
  await rpc('save_order_production_plan', productionInput());
  await assignLot();
  const lots = z.array(z.object({
    production_lot_code: z.string(),
    assigned_on: z.coerce.date().transform((value) => value.toISOString().slice(0, 10)),
    planned_gallons: z.coerce.number(),
    planned_batch_count: z.number(),
    status: z.string(),
  })).parse((await query(`select production_lot_code, assigned_on, planned_gallons, planned_batch_count, status
    from public.production_lots`)).rows);
  expect(lots).toEqual([{
    production_lot_code: '26126',
    assigned_on: '2026-09-18',
    planned_gallons: 160,
    planned_batch_count: 4,
    status: 'Assigned',
  }]);
  expect((await query(`select count(*)::int count from public.planned_mixer_batches batch
    join public.planned_spice_preparations prep on prep.planned_mixer_batch_id=batch.id
    where batch.production_lot_id is not null`)).rows).toEqual([{ count: 4 }]);
  expect((await counts()).events).toBe(0);
});
it('allows the same DDDYY on distinct products while rejecting duplicate lot assignment for one product', async () => {
  const secondProduct = id(301);
  const secondRecipe = id(410);
  const secondVersion = id(411);
  await database.exec(`insert into public.products(id,name) values('${secondProduct}','Second synthetic dressing');
    insert into public.recipes(id,product_id,name) values('${secondRecipe}','${secondProduct}','Second formula');
    insert into public.recipe_versions(id,recipe_id,version_number) values('${secondVersion}','${secondRecipe}',1);
    insert into public.recipe_sections(id,recipe_version_id,name,sequence) values('${id(412)}','${secondVersion}','Ingredients',1);
    insert into public.recipe_lines(id,recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
      values('${id(413)}','${secondVersion}','${id(412)}','${id(100)}','GARLIC',1,'10 lb',10,'lb');
    update public.recipe_versions set status='Released',released_by='${gateActor}' where id='${secondVersion}';
    update public.recipes set active_version_id='${secondVersion}' where id='${secondRecipe}';`);
  await rpc('save_customer_order', {
    ...orderInput(),
    products: [
      { product_id: id(300), batch_count: 1, customer_product_option_id: null },
      { product_id: secondProduct, batch_count: 1, customer_product_option_id: null },
    ],
  });
  await rpc('save_order_production_plan', productionInput());
  await assignLot(id(300));
  await assignLot(secondProduct);
  expect((await query('select production_lot_code from public.production_lots order by product_id')).rows)
    .toEqual([{ production_lot_code: '26126' }, { production_lot_code: '26126' }]);
  await expect(assignLot(id(300))).rejects.toThrow('already assigned');
});
it('retries creation and confirmation without duplicate records or revisions', async () => {
  await prepareOrder();
  await rpc('save_order_production_plan', productionInput());
  await rpc('save_order_production_plan', productionInput());
  const confirmation = { ...productionInput(1), status: 'Confirmed', shortage_reason: 'Expedite ingredient purchase' };
  await rpc('save_order_production_plan', confirmation);
  await rpc('save_order_production_plan', confirmation);
  expect(await counts()).toEqual({ batches: 4, preparations: 4, events: 0 });
  expect((await query('select revision,status from public.order_production_plans')).rows).toEqual([{ revision: 2, status: 'Confirmed' }]);
});
it('rejects stale revisions, invalid dates, and missing orders without partial batches', async () => {
  await prepareOrder();
  await expect(rpc('save_order_production_plan', { ...productionInput(), finish_on: '2026-10-02' })).rejects.toThrow('must finish');
  await expect(rpc('save_order_production_plan', { ...productionInput(), start_on: '2026-10-01' })).rejects.toThrow('Check production dates');
  await expect(rpc('save_order_production_plan', { ...productionInput(), id: id(999) })).rejects.toThrow('active customer order');
  expect((await counts()).batches).toBe(0);
  await rpc('save_order_production_plan', productionInput());
  await expect(rpc('save_order_production_plan', { ...productionInput(), note: 'Different request' })).rejects.toThrow('changed');
});
it('requires a shortage resolution before confirmation and preserves batch identities during revisions', async () => {
  await prepareOrder();
  await rpc('save_order_production_plan', productionInput());
  const before = await query('select id from public.planned_mixer_batches order by id');
  await expect(rpc('save_order_production_plan', { ...productionInput(1), status: 'Confirmed' })).rejects.toThrow('shortages');
  await rpc('save_order_production_plan', { ...productionInput(1), status: 'Confirmed', shortage_reason: 'Purchase ingredients' });
  await expect(rpc('save_order_production_plan', { ...productionInput(2), start_on: '2026-09-29' })).rejects.toThrow('reason');
  await rpc('save_order_production_plan', { ...productionInput(2), start_on: '2026-09-29', note: 'Delivery moved' });
  expect((await query('select id from public.planned_mixer_batches order by id')).rows).toEqual(before.rows);
});
it('blocks order cancellation until preparation is cancelled, including the legacy endpoint', async () => {
  await prepareOrder();
  await rpc('save_order_production_plan', productionInput());
  await expect(query('select public.cancel_customer_order($1)', [id(800)])).rejects.toThrow('Cancel production preparation');
  await expect(query('select public.cancel_material_plan($1)', [id(800)])).rejects.toThrow('Cancel production preparation');
  await rpc('save_order_production_plan', { ...productionInput(1), status: 'Cancelled', note: 'Customer changed request' });
  await query('select public.cancel_customer_order($1)', [id(800)]);
  await expect(rpc('save_order_production_plan', { ...productionInput(2), note: 'Reopen' })).rejects.toThrow('active customer order');
  expect((await counts()).batches).toBe(4);
});
it('denies reviewers, receivers, other facilities, and anonymous access', async () => {
  await prepareOrder();
  await rpc('save_order_production_plan', productionInput());
  await actAs(id(2));
  await expect(rpc('save_order_production_plan', productionInput(1))).rejects.toThrow('permission');
  await actAs(id(3));
  expect((await query('select * from public.order_production_plans')).rows).toEqual([]);
  await actAs(id(4));
  expect((await query('select * from public.order_production_plans')).rows).toEqual([]);
  await expect(rpc('save_order_production_plan', productionInput(1))).rejects.toThrow('active customer order');
  await database.exec('reset role; set role anon');
  await expect(rpc('save_order_production_plan', productionInput())).rejects.toThrow('permission');
});
it('rejects direct API forged batches, child deletion and status bypasses', async () => {
  await prepareOrder();
  await expect(query("insert into public.order_production_plans(id,start_on,finish_on,status) values($1,'2026-09-28','2026-09-30','Confirmed')", [id(800)])).rejects.toThrow('draft');
  await rpc('save_order_production_plan', productionInput());
  await expect(query(`insert into public.planned_mixer_batches(order_id,product_id,recipe_version_id,sequence,target_gallons)
    values($1,$2,$3,5,40)`, [id(800), id(300), id(401)])).rejects.toThrow('saved order');
  await expect(query('delete from public.planned_spice_preparations')).rejects.toThrow('permission');
  await expect(query('update public.order_production_plans set revision=99')).rejects.toThrow('changed');
});
it('excludes inbound after production starts, then restores the due-date horizon after cancellation', async () => {
  await prepareOrder();
  await rpc('create_purchase_draft', {
    id: id(900),
    material_plan_id: id(800),
    supplier_id: id(200),
    expected_on: '2026-09-30',
    lines: [{
      ingredient_id: id(100), supplier_item_id: id(201), purchase_units: 2, override_reason: '',
    }],
  });
  await rpc('change_purchase_status', {
    id: id(900), revision: 1, status: 'Confirmed', reference: 'PO-test', note: '',
  });
  const availability = async () => {
    const result = await query('select public.material_requirements($1) requirements', [id(800)]);
    return z.object({
      requirements: z.array(z.object({
        confirmed_inbound: z.number(), shortage: z.number(),
      })),
    }).parse(result.rows[0]).requirements[0];
  };
  expect(await availability()).toMatchObject({ confirmed_inbound: 60, shortage: 0 });
  await rpc('save_order_production_plan', productionInput());
  expect(await availability()).toMatchObject({ confirmed_inbound: 0, shortage: 40 });
  await rpc('save_order_production_plan', { ...productionInput(1), status: 'Cancelled', note: 'Replan dates' });
  expect(await availability()).toMatchObject({ confirmed_inbound: 60, shortage: 0 });
});
it('uses the production date for ingredient expiry and keeps commitments single-counted', async () => {
  await prepareOrder();
  await rpc('post_inventory_receipt', {
    request_id: id(950), supplier_id: id(200), ingredient_id: id(100), quantity: 40, uom: 'lb', received_on: '2026-09-25', supplier_reference: '', supplier_lot: 'EXPIRY', note: '', expiration_date: '2026-09-29',
  });
  await rpc('save_order_production_plan', productionInput());
  const result = await query('select public.material_requirements($1) requirements', [id(800)]);
  const requirement = z.object({
    requirements: z.array(z.object({
      on_hand: z.number(), other_commitments: z.number(), shortage: z.number(),
    })),
  }).parse(result.rows[0]).requirements[0];
  expect(requirement).toEqual({ on_hand: 40, other_commitments: 0, shortage: 0 });
  await rpc('save_order_production_plan', { ...productionInput(1), status: 'Confirmed' });
  expect((await counts()).events).toBe(1);
});
