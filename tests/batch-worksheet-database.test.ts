import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, afterEach, beforeAll, beforeEach, expect, it,
} from 'vitest';
import { z } from 'zod';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const idRowSchema = z.object({ id: z.uuid() });
const otherTenant = {
  actor: id(20),
  organization: id(21),
  facility: id(22),
  accessProfile: id(23),
  ingredient: id(1100),
  supplier: id(1200),
  product: id(1300),
  recipe: id(1400),
  recipeVersion: id(1401),
  recipeSection: id(1402),
  recipeLine: id(1403),
  order: id(1800),
  receiptRequest: id(1900),
  usage: id(1901),
};
const otherFacility = {
  actor: id(24),
  facility: id(25),
  order: id(1801),
  receiptRequest: id(1902),
  usage: id(1903),
};
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

async function prepareOtherTenantWorksheet() {
  await database.exec('reset role');
  await database.exec(`
    insert into auth.users(id,email) values('${otherTenant.actor}','other-admin@example.test');
    insert into public.organizations(id,name,slug)
      values('${otherTenant.organization}','Other tenant','other-tenant');
    insert into public.facilities(id,organization_id,name)
      values('${otherTenant.facility}','${otherTenant.organization}','Other facility');
    insert into public.access_profiles(id,organization_id,name,base_role,is_system)
      values('${otherTenant.accessProfile}','${otherTenant.organization}','Administrator','admin',true);
    insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
      select '${otherTenant.organization}','${otherTenant.accessProfile}',code from public.permissions;
    insert into public.profiles(
      id,organization_id,facility_id,display_name,work_email,role,access_profile_id
    ) values (
      '${otherTenant.actor}','${otherTenant.organization}','${otherTenant.facility}',
      'Other tenant admin','other-admin@example.test','admin','${otherTenant.accessProfile}'
    );
  `);
  await actAs(otherTenant.actor);
  await database.exec(`
    insert into public.ingredients(id,name,default_uom)
      values('${otherTenant.ingredient}','Other garlic','lb');
    insert into public.suppliers(id,name) values('${otherTenant.supplier}','Other supplier');
    insert into public.products(id,name) values('${otherTenant.product}','Other dressing');
    insert into public.recipes(id,product_id,name)
      values('${otherTenant.recipe}','${otherTenant.product}','Other formula');
    insert into public.recipe_versions(id,recipe_id,version_number)
      values('${otherTenant.recipeVersion}','${otherTenant.recipe}',1);
    insert into public.recipe_sections(id,recipe_version_id,name,sequence)
      values('${otherTenant.recipeSection}','${otherTenant.recipeVersion}','Ingredients',1);
    insert into public.recipe_lines(
      id,recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,
      display_measurement,normalized_quantity,normalized_uom
    ) values (
      '${otherTenant.recipeLine}','${otherTenant.recipeVersion}','${otherTenant.recipeSection}',
      '${otherTenant.ingredient}','GARLIC',1,'10 lb',10,'lb'
    );
    update public.recipe_versions set status='Released',released_by='${otherTenant.actor}'
      where id='${otherTenant.recipeVersion}';
    update public.recipes set active_version_id='${otherTenant.recipeVersion}'
      where id='${otherTenant.recipe}';
  `);
  await query('select public.save_customer_order($1::jsonb)', [JSON.stringify({
    id: otherTenant.order,
    customer_name: 'Other customer',
    reference: '',
    needed_on: '2026-10-01',
    products: [{
      product_id: otherTenant.product,
      batch_count: 1,
      customer_product_option_id: null,
    }],
  })]);
  await query('select public.save_order_production_plan($1::jsonb)', [JSON.stringify({
    id: otherTenant.order,
    revision: 0,
    start_on: '2026-09-28',
    finish_on: '2026-09-28',
    status: 'Draft',
    note: '',
    shortage_reason: '',
  })]);
}

async function prepareOtherFacilityWorksheet() {
  await database.exec('reset role');
  await database.exec(`
    insert into auth.users(id,email) values('${otherFacility.actor}','other-facility@example.test');
    insert into public.facilities(id,organization_id,name)
      values('${otherFacility.facility}','${otherTenant.organization}','Other tenant second facility');
    insert into public.profiles(
      id,organization_id,facility_id,display_name,work_email,role,access_profile_id
    ) values (
      '${otherFacility.actor}','${otherTenant.organization}','${otherFacility.facility}',
      'Other facility admin','other-facility@example.test','admin','${otherTenant.accessProfile}'
    );
  `);
  await actAs(otherFacility.actor);
  await query('select public.save_customer_order($1::jsonb)', [JSON.stringify({
    id: otherFacility.order,
    customer_name: 'Other facility customer',
    reference: '',
    needed_on: '2026-10-01',
    products: [{
      product_id: otherTenant.product,
      batch_count: 1,
      customer_product_option_id: null,
    }],
  })]);
  await query('select public.save_order_production_plan($1::jsonb)', [JSON.stringify({
    id: otherFacility.order,
    revision: 0,
    start_on: '2026-09-28',
    finish_on: '2026-09-28',
    status: 'Draft',
    note: '',
    shortage_reason: '',
  })]);
}

beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await actAs(gateActor);
  await database.exec(`insert into public.ingredients(id,name,default_uom) values('${id(100)}','Garlic','lb');
    insert into public.suppliers(id,name) values('${id(200)}','Supplier');
    insert into public.products(id,name) values('${id(300)}','Dressing');
    insert into public.recipes(id,product_id,name) values('${id(400)}','${id(300)}','Formula');
    insert into public.recipe_versions(id,recipe_id,version_number) values('${id(401)}','${id(400)}',1);
    insert into public.recipe_sections(id,recipe_version_id,name,sequence) values('${id(402)}','${id(401)}','Ingredients',1);
    insert into public.recipe_lines(id,recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
      values('${id(403)}','${id(401)}','${id(402)}','${id(100)}','GARLIC',1,'10 lb',10,'lb');
    update public.recipe_versions set status='Released',released_by='${gateActor}' where id='${id(401)}';
    update public.recipes set active_version_id='${id(401)}' where id='${id(400)}';`);
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

it('keeps two actual source packages as immutable contributions to one recipe line', async () => {
  await query('select public.save_customer_order($1::jsonb)', [JSON.stringify({
    id: id(800), customer_name: 'Customer', reference: '', needed_on: '2026-10-01', products: [{ product_id: id(300), batch_count: 1, customer_product_option_id: null }],
  })]);
  await query('select public.save_order_production_plan($1::jsonb)', [JSON.stringify({
    id: id(800), revision: 0, start_on: '2026-09-28', finish_on: '2026-09-28', status: 'Draft', note: '', shortage_reason: '',
  })]);
  await query('select public.assign_production_lot($1::jsonb)', [JSON.stringify({ order_id: id(800), product_id: id(300), assigned_on: '2026-09-28' })]);
  await query('select public.receive_serialized_delivery($1::jsonb)', [JSON.stringify({
    request_id: id(900), supplier_id: id(200), ingredient_id: id(100), quantity: 10, uom: 'lb', received_on: '2026-09-27', supplier_reference: '', supplier_lot: 'SUP-LOT-7', expiration_date: '2026-10-10', note: '', supplier_item_id: null, packages: [{ quantity: 4, supplier_barcode: 'PKG-A' }, { quantity: 6, supplier_barcode: 'PKG-B' }],
  })]);
  const batch = idRowSchema.parse((await query('select id from public.planned_mixer_batches where order_id=$1', [id(800)])).rows[0]);
  const execution = idRowSchema.parse((await query('select public.open_batch_worksheet($1) id', [batch.id])).rows[0]);
  const line = idRowSchema.parse((await query('select id from public.batch_worksheet_lines where execution_id=$1', [execution.id])).rows[0]);
  const packages = z.array(idRowSchema).length(2).parse((await query('select id from public.serialized_units order by ordinal')).rows);
  const [firstPackage, secondPackage] = packages;
  if (!firstPackage || !secondPackage) throw new Error('Expected two serialized packages.');
  await query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(901), worksheet_line_id: line.id, serialized_unit_id: firstPackage.id, quantity: 4,
  })]);
  await query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(902), worksheet_line_id: line.id, serialized_unit_id: secondPackage.id, quantity: 6,
  })]);
  const usages = await query('select source_lot,quantity,operator_id,used_at from public.batch_worksheet_source_usages order by quantity');
  expect(usages.rows).toHaveLength(2);
  expect(z.array(z.object({
    source_lot: z.string(), quantity: z.coerce.number(), operator_id: z.uuid(), used_at: z.date(),
  })).parse(usages.rows).map((row) => row.source_lot)).toEqual(['SUP-LOT-7', 'SUP-LOT-7']);
  await database.exec('savepoint immutable_usage');
  await expect(query('update public.batch_worksheet_source_usages set quantity=1')).rejects.toThrow();
  await database.exec('rollback to savepoint immutable_usage; release savepoint immutable_usage');
  const productionLot = idRowSchema.parse((await query('select id from public.production_lots')).rows[0]);
  const backward = z.object({
    lot: z.object({ production_lot_code: z.literal('27126') }),
    allocations: z.array(z.object({ source_lot: z.literal('SUP-LOT-7') })),
  }).parse(z.object({ trace: z.unknown() }).parse(
    (await query('select public.trace_production_lot($1) trace', [productionLot.id])).rows[0],
  ).trace);
  expect(backward.allocations).toHaveLength(2);
  const forward = z.object({
    matches: z.array(z.object({ source_lot: z.literal('SUP-LOT-7'), supplier_name: z.literal('Supplier') })),
    affected_batches: z.array(z.object({ production_lot_code: z.literal('27126'), batch_sequence: z.literal(1) })),
  }).parse(z.object({ trace: z.unknown() }).parse(
    (await query("select public.trace_source_material('SUP-LOT-7') trace")).rows[0],
  ).trace);
  expect(forward.matches).toHaveLength(1);
  expect(forward.affected_batches).toHaveLength(2);
  await query('select public.complete_batch_worksheet($1)', [execution.id]);
});

it('keeps every privileged production RPC inside the caller tenant and facility', async () => {
  await prepareOtherTenantWorksheet();

  await actAs(gateActor);
  await expect(query('select public.assign_production_lot($1::jsonb)', [JSON.stringify({
    order_id: otherTenant.order,
    product_id: otherTenant.product,
    assigned_on: '2026-09-28',
  })])).rejects.toThrow('Save a draft production preparation');

  await actAs(otherTenant.actor);
  const productionLot = idRowSchema.parse((await query(
    'select public.assign_production_lot($1::jsonb) id',
    [JSON.stringify({
      order_id: otherTenant.order,
      product_id: otherTenant.product,
      assigned_on: '2026-09-28',
    })],
  )).rows[0]);
  await query('select public.receive_serialized_delivery($1::jsonb)', [JSON.stringify({
    request_id: otherTenant.receiptRequest,
    supplier_id: otherTenant.supplier,
    ingredient_id: otherTenant.ingredient,
    quantity: 10,
    uom: 'lb',
    received_on: '2026-09-27',
    supplier_reference: '',
    supplier_lot: 'OTHER-LOT',
    expiration_date: '2026-10-10',
    note: '',
    supplier_item_id: null,
    packages: [{ quantity: 10, supplier_barcode: 'OTHER-PKG' }],
  })]);
  const batch = idRowSchema.parse((await query(
    'select id from public.planned_mixer_batches where order_id=$1',
    [otherTenant.order],
  )).rows[0]);
  const unit = idRowSchema.parse((await query(
    'select id from public.serialized_units where organization_id=$1',
    [otherTenant.organization],
  )).rows[0]);

  await actAs(gateActor);
  await expect(query('select public.open_batch_worksheet($1)', [batch.id]))
    .rejects.toThrow('Choose an assigned production batch');

  await actAs(otherTenant.actor);
  const execution = idRowSchema.parse((await query(
    'select public.open_batch_worksheet($1) id',
    [batch.id],
  )).rows[0]);
  const line = idRowSchema.parse((await query(
    'select id from public.batch_worksheet_lines where execution_id=$1',
    [execution.id],
  )).rows[0]);

  await actAs(gateActor);
  await expect(query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: otherTenant.usage,
    worksheet_line_id: line.id,
    serialized_unit_id: unit.id,
    quantity: 10,
  })])).rejects.toThrow('Choose an open worksheet line');
  await expect(query('select public.complete_batch_worksheet($1)', [execution.id]))
    .rejects.toThrow('Choose an open worksheet');

  await actAs(otherTenant.actor);
  expect(idRowSchema.parse((await query(
    'select public.record_batch_worksheet_usage($1::jsonb) id',
    [JSON.stringify({
      id: otherTenant.usage,
      worksheet_line_id: line.id,
      serialized_unit_id: unit.id,
      quantity: 10,
    })],
  )).rows[0])).toEqual({ id: otherTenant.usage });

  await actAs(gateActor);
  await expect(query('select public.complete_batch_worksheet($1)', [execution.id]))
    .rejects.toThrow('Choose an open worksheet');

  await actAs(otherTenant.actor);
  expect(idRowSchema.parse((await query(
    'select public.complete_batch_worksheet($1) id',
    [execution.id],
  )).rows[0])).toEqual({ id: execution.id });

  await database.exec('reset role');
  const scopedRows = z.array(z.object({
    organization_id: z.literal(otherTenant.organization),
    facility_id: z.literal(otherTenant.facility),
  })).parse((await query(`
    select organization_id,facility_id from public.production_lots where id=$1
    union all
    select organization_id,facility_id from public.batch_worksheet_executions where id=$2
    union all
    select organization_id,facility_id from public.batch_worksheet_source_usages where id=$3
  `, [productionLot.id, execution.id, otherTenant.usage])).rows);
  expect(scopedRows).toHaveLength(3);
});

it('keeps every privileged production RPC inside the caller facility within one tenant', async () => {
  await prepareOtherTenantWorksheet();
  await prepareOtherFacilityWorksheet();

  await actAs(otherTenant.actor);
  await expect(query('select public.assign_production_lot($1::jsonb)', [JSON.stringify({
    order_id: otherFacility.order,
    product_id: otherTenant.product,
    assigned_on: '2026-09-28',
  })])).rejects.toThrow('Save a draft production preparation');

  await actAs(otherFacility.actor);
  await query('select public.assign_production_lot($1::jsonb)', [JSON.stringify({
    order_id: otherFacility.order,
    product_id: otherTenant.product,
    assigned_on: '2026-09-28',
  })]);
  await query('select public.receive_serialized_delivery($1::jsonb)', [JSON.stringify({
    request_id: otherFacility.receiptRequest,
    supplier_id: otherTenant.supplier,
    ingredient_id: otherTenant.ingredient,
    quantity: 10,
    uom: 'lb',
    received_on: '2026-09-27',
    supplier_reference: '',
    supplier_lot: 'OTHER-FACILITY-LOT',
    expiration_date: '2026-10-10',
    note: '',
    supplier_item_id: null,
    packages: [{ quantity: 10, supplier_barcode: 'OTHER-FACILITY-PKG' }],
  })]);
  const batch = idRowSchema.parse((await query(
    'select id from public.planned_mixer_batches where order_id=$1',
    [otherFacility.order],
  )).rows[0]);
  const unit = idRowSchema.parse((await query(
    'select id from public.serialized_units where facility_id=$1',
    [otherFacility.facility],
  )).rows[0]);

  await actAs(otherTenant.actor);
  await expect(query('select public.open_batch_worksheet($1)', [batch.id]))
    .rejects.toThrow('Choose an assigned production batch');

  await actAs(otherFacility.actor);
  const execution = idRowSchema.parse((await query(
    'select public.open_batch_worksheet($1) id',
    [batch.id],
  )).rows[0]);
  const line = idRowSchema.parse((await query(
    'select id from public.batch_worksheet_lines where execution_id=$1',
    [execution.id],
  )).rows[0]);

  await actAs(otherTenant.actor);
  await expect(query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: otherFacility.usage,
    worksheet_line_id: line.id,
    serialized_unit_id: unit.id,
    quantity: 10,
  })])).rejects.toThrow('Choose an open worksheet line');

  await actAs(otherFacility.actor);
  await query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: otherFacility.usage,
    worksheet_line_id: line.id,
    serialized_unit_id: unit.id,
    quantity: 10,
  })]);

  await actAs(otherTenant.actor);
  await expect(query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: otherFacility.usage,
    worksheet_line_id: line.id,
    serialized_unit_id: unit.id,
    quantity: 10,
  })])).rejects.toThrow('Choose an open worksheet line');
  await expect(query('select public.complete_batch_worksheet($1)', [execution.id]))
    .rejects.toThrow('Choose an open worksheet');

  await actAs(otherFacility.actor);
  await expect(query('select public.complete_batch_worksheet($1)', [execution.id]))
    .resolves.toBeDefined();

  await database.exec('reset role');
  expect((await query(`
    select count(*)::int count
    from public.batch_worksheet_executions
    where id=$1 and organization_id=$2 and facility_id=$3 and status='Complete'
  `, [execution.id, otherTenant.organization, otherFacility.facility])).rows)
    .toEqual([{ count: 1 }]);
});

it('denies anonymous traceability RPC execution', async () => {
  await database.exec('reset role; set role anon');
  await expect(query("select public.trace_source_material('SUP-LOT-7')")).rejects.toThrow('permission');
});
