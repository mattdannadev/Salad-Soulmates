import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  beforeAll, beforeEach, afterEach, afterAll, describe, expect, it,
} from 'vitest';
import { initializeGateDatabase, gateActor } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;
const receipt = () => ({
  request_id: id(500),
  supplier_id: id(200),
  ingredient_id: id(100),
  quantity: 50,
  uom: 'lb',
  received_on: '2026-09-20',
  supplier_lot: 'LOT-2026',
  expiration_date: '2099-10-01',
  supplier_reference: 'DELIVERY-1',
  note: '',
  supplier_item_id: id(201),
  packages: [{ quantity: 30, supplier_barcode: 'UNIQUE-1' }, { quantity: 20, supplier_barcode: '' }],
});
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
async function rpc(name: 'receive_serialized_delivery' | 'serialize_receipt_line' | 'change_serialized_unit' | 'post_inventory_receipt', payload: unknown) {
  return query(`select public.${name}($1::jsonb) as id`, [JSON.stringify(payload)]);
}
async function firstUnit() {
  const result = await query('select id,revision,remaining_quantity,status from public.serialized_unit_balances order by ordinal');
  return z.object({
    id: z.uuid(), revision: z.number(), remaining_quantity: z.coerce.number(), status: z.string(),
  }).parse(result.rows[0]);
}
async function change(overrides: Record<string, unknown> = {}) {
  const unit = await firstUnit();
  return {
    id: id(600),
    unit_id: unit.id,
    expected_revision: unit.revision,
    remaining_quantity: unit.remaining_quantity,
    status: unit.status,
    reason: 'Measured balance correction',
    ...overrides,
  };
}
beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await database.exec(`
    insert into auth.users values('${id(2)}'),('${id(3)}'),('${id(4)}'),('${id(5)}');
    insert into public.facilities(id,organization_id,name) values('${id(12)}','${id(10)}','Other facility');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(2)}','${id(10)}','${id(11)}','Reviewer','reviewer',id from public.access_profiles where name='Operations Reviewer';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(3)}','${id(10)}','${id(11)}','Receiver','receiver',id from public.access_profiles where name='Receiver';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(4)}','${id(10)}','${id(12)}','Other admin','admin',id from public.access_profiles where name='Administrator';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(5)}','${id(10)}','${id(11)}','Worker','worker',id from public.access_profiles where name='Production Worker';
  `);
  await actAs(gateActor);
  await database.exec(`
    insert into public.ingredients(id,name,default_uom) values('${id(100)}','Test garlic','lb');
    insert into public.suppliers(id,name) values('${id(200)}','Test supplier');
    insert into public.supplier_items(id,supplier_id,ingredient_id,purchase_uom,pack_quantity,pack_quantity_uom)
      values('${id(201)}','${id(200)}','${id(100)}','bag',25,'lb');
    insert into public.products(id,name) values('${id(300)}','Test dressing');
    insert into public.recipes(id,product_id,name) values('${id(400)}','${id(300)}','Formula');
    insert into public.recipe_versions(id,recipe_id,version_number) values('${id(401)}','${id(400)}',1);
    insert into public.recipe_sections(id,recipe_version_id,name,sequence) values('${id(402)}','${id(401)}','Ingredients',1);
    insert into public.recipe_lines(recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
      values('${id(401)}','${id(402)}','${id(100)}','TEST',1,'10 lb',10,'lb');
    update public.recipe_versions set status='Released',released_by='${gateActor}' where id='${id(401)}';
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

describe('physical package receiving and serialization', () => {
  it('atomically preserves lot, creates distinct identities, snapshots supplier item and posts once', async () => {
    await actAs(id(3));
    await rpc('receive_serialized_delivery', receipt());
    await rpc('receive_serialized_delivery', receipt());
    expect((await query('select * from public.serialized_units')).rows).toHaveLength(2);
    expect((await query('select * from public.inventory_events')).rows).toHaveLength(1);
    expect((await query('select supplier_lot,remaining_quantity,availability from public.serialized_unit_balances order by ordinal')).rows)
      .toEqual([{ supplier_lot: 'LOT-2026', remaining_quantity: '30.0000', availability: 'Available' },
        { supplier_lot: 'LOT-2026', remaining_quantity: '20.0000', availability: 'Available' }]);
    await expect(rpc('receive_serialized_delivery', { ...receipt(), packages: [{ quantity: 50, supplier_barcode: '' }] }))
      .rejects.toThrow('different values');
    await actAs(gateActor);
    await query('update public.supplier_items set pack_quantity=99 where id=$1', [id(201)]);
    expect((await query("select supplier_item_snapshot->>'pack_quantity' as quantity from public.receipt_serializations")).rows[0])
      .toEqual({ quantity: '25.0000' });
  });
  it.each([
    [{ quantity: 49, supplier_barcode: '' }],
    [{ quantity: 25, supplier_barcode: 'SAME' }, { quantity: 25, supplier_barcode: 'SAME' }],
    [{ quantity: 50, supplier_barcode: 'SSU-FORGED' }],
    [{ quantity: 0.00001, supplier_barcode: '' }, { quantity: 49.99999, supplier_barcode: '' }],
    [],
  ].map((packages) => ({ packages })))('rolls back the entire receipt when packages are invalid: %j', async ({ packages }) => {
    await expect(rpc('receive_serialized_delivery', { ...receipt(), packages })).rejects.toThrow();
    expect((await query('select * from public.inventory_receipts')).rows).toHaveLength(0);
    expect((await query('select * from public.inventory_events')).rows).toHaveLength(0);
  });
  it('assigns a fallback source lot and rejects duplicate supplier serials on another delivery', async () => {
    await rpc('receive_serialized_delivery', { ...receipt(), supplier_lot: '' });
    expect((await query('select source_lot_origin,assigned_source_lot from public.inventory_receipt_lines')).rows)
      .toEqual([{ source_lot_origin: 'salad_soulmates_assigned', assigned_source_lot: 'SL-26263-0001' }]);
    await database.exec('rollback');
    await database.exec('begin');
    await actAs(gateActor);
    await rpc('receive_serialized_delivery', receipt());
    await expect(rpc('receive_serialized_delivery', { ...receipt(), request_id: id(501) })).rejects.toThrow('unique');
    expect((await query('select * from public.inventory_receipts')).rows).toHaveLength(1);
  });
  it('serializes a legacy receipt without posting inventory again', async () => {
    await rpc('post_inventory_receipt', receipt());
    const line = z.object({ id: z.uuid() }).parse((await query('select id from public.inventory_receipt_lines')).rows[0]);
    await rpc('serialize_receipt_line', { receipt_line_id: line.id, packages: receipt().packages });
    expect((await query('select * from public.serialized_units')).rows).toHaveLength(2);
    expect((await query('select * from public.inventory_events')).rows).toHaveLength(1);
  });
  it('resolves internal and supplier barcodes to the same supplier lot and balance', async () => {
    await rpc('receive_serialized_delivery', receipt());
    const unit = z.object({ internal_code: z.string() }).parse((await query('select internal_code from public.serialized_units where ordinal=1')).rows[0]);
    const external = await query("select public.find_serialized_units('UNIQUE-1') as result");
    const internal = await query('select public.find_serialized_units($1) as result', [unit.internal_code]);
    expect(external.rows).toEqual(internal.rows);
    const result = z.object({
      result: z.array(z.object({ supplier_lot: z.string(), remaining_quantity: z.number() })),
    }).parse(external.rows[0]);
    expect(result.result).toHaveLength(1);
    expect(result.result[0]).toEqual({ supplier_lot: 'LOT-2026', remaining_quantity: 30 });
  });
  it('records partial balances once and rejects conflicting retries, stale changes, and excess quantity', async () => {
    await rpc('receive_serialized_delivery', receipt());
    const payload = await change({ remaining_quantity: 12 });
    await rpc('change_serialized_unit', payload);
    await rpc('change_serialized_unit', payload);
    expect((await firstUnit()).remaining_quantity).toBe(12);
    expect((await query('select sum(quantity_delta) as quantity from public.inventory_events')).rows[0]).toEqual({ quantity: '32.0000' });
    await expect(rpc('change_serialized_unit', { ...payload, remaining_quantity: 13 })).rejects.toThrow('different values');
    await expect(rpc('change_serialized_unit', { ...payload, id: id(601) })).rejects.toThrow('Package changed');
    await expect(rpc('change_serialized_unit', await change({ id: id(602), remaining_quantity: 31 }))).rejects.toThrow('cannot exceed');
  });
  it('excludes held, quarantined and expired packages from planning without double-counting corrections', async () => {
    await rpc('receive_serialized_delivery', receipt());
    await query('select public.save_material_plan($1::jsonb)', [JSON.stringify({
      id: id(800), name: 'Test', needed_on: '2026-10-01', batches: [{ recipe_version_id: id(401), batch_count: 10 }],
    })]);
    async function stock() {
      const result = await query("select public.material_requirements($1)->0->>'on_hand' as stock", [id(800)]);
      return z.object({ stock: z.coerce.number() }).parse(result.rows[0]).stock;
    }
    expect(await stock()).toBe(50);
    await rpc('change_serialized_unit', await change({ status: 'Hold' }));
    expect(await stock()).toBe(20);
    await rpc('change_serialized_unit', await change({ id: id(601), status: 'Quarantined' }));
    expect(await stock()).toBe(20);
    await rpc('change_serialized_unit', await change({ id: id(602), status: 'Available', remaining_quantity: 12 }));
    expect(await stock()).toBe(32);
    await rpc('receive_serialized_delivery', {
      ...receipt(), request_id: id(501), expiration_date: '2026-01-01', packages: [{ quantity: 50, supplier_barcode: '' }],
    });
    expect(await stock()).toBe(32);
  });
  it('never releases an expired or exhausted package by marking its status Available', async () => {
    await rpc('receive_serialized_delivery', { ...receipt(), expiration_date: '2026-01-01' });
    await rpc('change_serialized_unit', await change({ status: 'Hold' }));
    await rpc('change_serialized_unit', await change({ id: id(601), status: 'Available' }));
    expect((await query('select availability from public.serialized_unit_balances where ordinal=1')).rows[0]).toEqual({ availability: 'Expired' });
  });
  it('enforces reviewer, receiver, worker and cross-facility restrictions', async () => {
    await rpc('receive_serialized_delivery', receipt());
    const payload = await change({ status: 'Hold' });
    await actAs(id(2));
    await expect(rpc('receive_serialized_delivery', receipt())).rejects.toThrow('permission');
    await expect(rpc('change_serialized_unit', payload)).rejects.toThrow('permission');
    await actAs(id(3));
    await expect(rpc('change_serialized_unit', payload)).rejects.toThrow('permission');
    await actAs(id(4));
    expect((await query('select * from public.serialized_unit_balances')).rows).toEqual([]);
    await expect(rpc('change_serialized_unit', payload)).rejects.toThrow('not found');
    await actAs(id(5));
    expect((await query('select * from public.serialized_unit_balances')).rows).toEqual([]);
  });
  it('blocks direct mutation, deletion, and unmatched package allocations', async () => {
    await rpc('receive_serialized_delivery', receipt());
    await expect(query('update public.serialized_units set initial_quantity=90')).rejects.toThrow('row-level security');
    await expect(query('delete from public.serialized_unit_events')).rejects.toThrow('permission denied');
    await expect(query('select public.guard_serialized_unit_event()')).rejects.toThrow('permission denied');
    await expect(query('insert into public.serialized_units(serialization_id,ordinal,initial_quantity) select id,3,1 from public.receipt_serializations')).rejects.toThrow('immutable receipt allocation');
  });
});
