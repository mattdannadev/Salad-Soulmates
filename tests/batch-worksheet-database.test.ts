import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, afterEach, beforeAll, beforeEach, expect, it,
} from 'vitest';
import { z } from 'zod';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const idRowSchema = z.object({ id: z.uuid() });
let database: PGlite;
async function query(sql: string, parameters: unknown[] = []) {
  return database.query(sql, parameters);
}
async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
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
  const planRevision = z.object({ revision: z.number() }).parse((await query(
    'select revision from public.order_production_plans where id=$1', [id(800)],
  )).rows[0]).revision;
  await query('select public.save_order_production_plan($1::jsonb)', [JSON.stringify({
    id: id(800), revision: planRevision, start_on: '2026-09-28', finish_on: '2026-09-28',
    status: 'Confirmed', note: '', shortage_reason: '',
  })]);
  const batch = idRowSchema.parse((await query('select id from public.planned_mixer_batches where order_id=$1', [id(800)])).rows[0]);
  const execution = idRowSchema.parse((await query('select public.open_batch_worksheet($1) id', [batch.id])).rows[0]);
  const line = idRowSchema.parse((await query('select id from public.batch_worksheet_lines where execution_id=$1', [execution.id])).rows[0]);
  const packages = z.array(idRowSchema).length(2).parse((await query('select id from public.serialized_units order by ordinal')).rows);
  const [firstPackage, secondPackage] = packages;
  if (!firstPackage || !secondPackage) throw new Error('Expected two serialized packages.');
  const before = await query('select sum(quantity_delta) balance from public.inventory_events where ingredient_id=$1', [id(100)]);
  expect(z.coerce.number().parse((before.rows[0] as { balance: unknown }).balance)).toBe(10);
  await query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(901), worksheet_line_id: line.id, serialized_unit_id: firstPackage.id, quantity: 4,
  })]);
  await query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(902), worksheet_line_id: line.id, serialized_unit_id: secondPackage.id, quantity: 6,
  })]);
  const issuePayload = {
    id: id(906), execution_id: execution.id, worksheet_line_id: line.id,
    serialized_unit_id: firstPackage.id, category: 'Bucket', note: 'Seal was damaged',
  };
  await query('select public.report_spice_preparation_issue($1::jsonb)', [JSON.stringify(issuePayload)]);
  await query('select public.report_spice_preparation_issue($1::jsonb)', [JSON.stringify(issuePayload)]);
  expect((await query('select id from public.spice_preparation_issues')).rows).toHaveLength(1);
  const workerTask = z.array(z.object({ issues: z.array(z.object({
    id: z.uuid(), category: z.literal('Bucket'), note: z.literal('Seal was damaged'),
    worksheet_line_id: z.uuid(), serialized_unit_id: z.uuid(),
  })) })).parse(z.object({ tasks: z.unknown() }).parse(
    (await query('select public.worker_spice_preparations() tasks')).rows[0],
  ).tasks);
  expect(workerTask[0]?.issues).toHaveLength(1);
  await database.exec('savepoint changed_issue');
  await expect(query('select public.report_spice_preparation_issue($1::jsonb)', [JSON.stringify({
    ...issuePayload, note: 'Different note',
  })])).rejects.toThrow('Issue request is already in use');
  await database.exec('rollback to savepoint changed_issue; release savepoint changed_issue');
  // A correction changes the physical quantity to be consumed at completion.
  // The replacement allocation restores the recipe line to its required ten pounds.
  await query('select public.correct_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(903), usage_id: id(901), restored_quantity: 2, reason: 'Weighed amount corrected',
  })]);
  await query('select public.correct_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(903), usage_id: id(901), restored_quantity: 2, reason: 'Weighed amount corrected',
  })]);
  await query('select public.correct_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(905), usage_id: id(901), restored_quantity: 1, reason: 'Second scale correction',
  })]);
  await query('select public.record_batch_worksheet_usage($1::jsonb)', [JSON.stringify({
    id: id(904), worksheet_line_id: line.id, serialized_unit_id: firstPackage.id, quantity: 3,
  })]);
  const allocatedOnly = await query('select sum(quantity_delta) balance from public.inventory_events where ingredient_id=$1', [id(100)]);
  expect(z.coerce.number().parse((allocatedOnly.rows[0] as { balance: unknown }).balance)).toBe(10);
  const usages = await query('select source_lot,quantity,operator_id,used_at from public.batch_worksheet_source_usages order by quantity');
  expect(usages.rows).toHaveLength(3);
  expect(z.array(z.object({
    source_lot: z.string(), quantity: z.coerce.number(), operator_id: z.uuid(), used_at: z.date(),
  })).parse(usages.rows).map((row) => row.source_lot)).toEqual(['SUP-LOT-7', 'SUP-LOT-7', 'SUP-LOT-7']);
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
  expect(backward.allocations).toHaveLength(3);
  const forward = z.object({
    matches: z.array(z.object({ source_lot: z.literal('SUP-LOT-7'), supplier_name: z.literal('Supplier') })),
    affected_batches: z.array(z.object({ production_lot_code: z.literal('27126'), batch_sequence: z.literal(1) })),
  }).parse(z.object({ trace: z.unknown() }).parse(
    (await query("select public.trace_source_material('SUP-LOT-7') trace")).rows[0],
  ).trace);
  expect(forward.matches).toHaveLength(1);
  expect(forward.affected_batches).toHaveLength(3);
  await query('select public.complete_batch_worksheet($1)', [execution.id]);
  await query('select public.complete_batch_worksheet($1)', [execution.id]);
  await database.exec('savepoint issue_after_completion');
  await expect(query('select public.report_spice_preparation_issue($1::jsonb)', [JSON.stringify({
    id: id(907), execution_id: execution.id, category: 'Spice', note: 'New issue after completion',
  })])).rejects.toThrow('Choose an open spice preparation');
  await database.exec('rollback to savepoint issue_after_completion; release savepoint issue_after_completion');
  const after = await query('select sum(quantity_delta) balance from public.inventory_events where ingredient_id=$1', [id(100)]);
  expect(z.coerce.number().parse((after.rows[0] as { balance: unknown }).balance)).toBe(0);
  const consumed = await query('select source_lot,quantity from public.spice_preparation_consumptions order by quantity');
  expect(consumed.rows).toHaveLength(3);
  expect(consumed.rows.map((row) => z.coerce.number().parse((row as { quantity: unknown }).quantity))).toEqual([1, 3, 6]);
  const physicalTrace = z.object({ allocations: z.array(z.object({ quantity: z.coerce.number() })) }).parse(
    z.object({ trace: z.unknown() }).parse((await query('select public.trace_production_lot($1) trace', [productionLot.id])).rows[0]).trace,
  );
  expect(physicalTrace.allocations.map((row) => row.quantity).sort((a, b) => a - b)).toEqual([1, 3, 6]);
  const sourceTrace = z.object({ affected_batches: z.array(z.object({ quantity: z.coerce.number() })) }).parse(
    z.object({ trace: z.unknown() }).parse((await query("select public.trace_source_material('SUP-LOT-7') trace")).rows[0]).trace,
  );
  expect(sourceTrace.affected_batches.map((row) => row.quantity).sort((a, b) => a - b)).toEqual([1, 3, 6]);
  const balances = await query('select remaining_quantity from public.serialized_unit_balances order by ordinal');
  expect(balances.rows.map((row) => z.coerce.number().parse((row as { remaining_quantity: unknown }).remaining_quantity))).toEqual([0, 0]);
});

it('denies anonymous traceability RPC execution', async () => {
  await database.exec('reset role; set role anon');
  await expect(query("select public.trace_source_material('SUP-LOT-7')")).rejects.toThrow('permission');
});
