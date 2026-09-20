import { z } from 'zod';
import { PGlite } from '@electric-sql/pglite';
import { shippingDraftRowSchema } from '@/domain/shipping';
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

async function rpc(name: 'save_shipping_draft' | 'save_customer_order' | 'save_order_production_plan' | 'post_inventory_receipt' | 'create_purchase_draft' | 'change_purchase_status', payload: unknown) {
  return query(`select public.${name}($1::jsonb) as id`, [JSON.stringify(payload)]);
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

const draftInput = () => ({
  id: id(900),
  order_id: id(800),
  planned_on: '2026-10-01',
  method: 'Pickup',
  note: '',
  lines: [{ product_id: id(300), quantity: 5 }],
});
async function prepareOrder() {
  await rpc('save_customer_order', orderInput());
}
it('saves partial quantities without fulfilling orders or posting inventory and safely retries', async () => {
  await prepareOrder();
  await rpc('save_shipping_draft', draftInput());
  await rpc('save_shipping_draft', draftInput());
  const result = await query(`select
    (select count(*)::int from public.shipping_drafts) drafts,
    (select count(*)::int from public.inventory_events) events,
    (select status from public.material_plans where id='${id(800)}') status`);
  expect(result.rows[0]).toEqual({ drafts: 1, events: 0, status: 'Active' });
  await expect(rpc('save_shipping_draft', { ...draftInput(), note: 'different' }))
    .rejects.toThrow('already used with different details');
});
it.each([0, -1, 0.5, 41, 1000000001])('rejects invalid or over-order quantity %s', async (quantity) => {
  await prepareOrder();
  await expect(rpc('save_shipping_draft', {
    ...draftInput(), lines: [{ product_id: id(300), quantity }],
  })).rejects.toThrow();
});
it('rejects unknown products, duplicate products, absent orders and confirmation fields', async () => {
  await prepareOrder();
  await expect(rpc('save_shipping_draft', {
    ...draftInput(), lines: [{ product_id: id(301), quantity: 1 }],
  })).rejects.toThrow('Choose products');
  await expect(rpc('save_shipping_draft', {
    ...draftInput(), lines: [...draftInput().lines, ...draftInput().lines],
  })).rejects.toThrow('Include each product');
  await expect(rpc('save_shipping_draft', {
    ...draftInput(), order_id: id(999),
  })).rejects.toThrow('Choose an active');
  await expect(rpc('save_shipping_draft', {
    ...draftInput(), status: 'Confirmed',
  })).rejects.toThrow('Invalid shipping draft');
});
it('blocks new drafts after cancellation but acknowledges an already saved retry', async () => {
  await prepareOrder();
  await rpc('save_shipping_draft', draftInput());
  await query('select public.cancel_customer_order($1)', [id(800)]);
  await expect(rpc('save_shipping_draft', { ...draftInput(), id: id(901) }))
    .rejects.toThrow('Choose an active');
  await expect(rpc('save_shipping_draft', draftInput())).resolves.toBeDefined();
});
it.each([id(2), id(3), id(4)])('denies unauthorized writes and isolates other facilities: %s', async (actor) => {
  await prepareOrder();
  await rpc('save_shipping_draft', draftInput());
  await actAs(actor);
  await expect(rpc('save_shipping_draft', { ...draftInput(), id: id(901) })).rejects.toThrow();
  if (actor === id(4) || actor === id(3)) {
    expect((await query('select * from public.shipping_drafts')).rows).toHaveLength(0);
  }
});
it('prevents direct API over-quantity inserts, edits, deletion, and anonymous access', async () => {
  await prepareOrder();
  await expect(query(`insert into public.shipping_drafts(id,order_id,planned_on,method,lines)
    values($1,$2,'2026-10-01','Pickup',$3::jsonb)`, [id(901), id(800), JSON.stringify([{ product_id: id(300), quantity: 41 }])]))
    .rejects.toThrow('exceeds ordered');
  await rpc('save_shipping_draft', draftInput());
  await expect(query('update public.shipping_drafts set note=$1', ['changed'])).rejects.toThrow();
  await expect(query('delete from public.shipping_drafts')).rejects.toThrow();
  await database.exec('reset role; set role anon');
  await expect(query('select * from public.shipping_drafts')).rejects.toThrow();
  await expect(rpc('save_shipping_draft', draftInput())).rejects.toThrow();
});
it('validates returned draft rows with database metadata', async () => {
  await prepareOrder();
  await rpc('save_shipping_draft', draftInput());
  const result = await query('select to_jsonb(draft) as draft from public.shipping_drafts draft');
  const row = z.object({ draft: shippingDraftRowSchema }).parse(result.rows[0]);
  expect(row.draft.lines[0]?.quantity).toBe(5);
});
