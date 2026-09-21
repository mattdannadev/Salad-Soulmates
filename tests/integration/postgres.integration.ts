import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { z } from 'zod';
import {
  afterAll, afterEach, beforeAll, beforeEach, expect, it,
} from 'vitest';
import postgresTarget from './postgres-target';
import { initializeGateDatabase, gateActor as actor } from './postgres-bootstrap';

const target = postgresTarget(process.env);
const database = `ss_gate_${randomUUID().replaceAll('-', '')}`;
const maintenance = new Client(target);
const observer = new Client({ ...target, database });
let created = false;
let first: Client;
let second: Client;
const resultRows = z.object({ rows: z.array(z.record(z.string(), z.unknown())) });

beforeAll(async () => {
  await maintenance.connect();
  // Name is generated locally from a UUID, never accepted from environment/input.
  await maintenance.query(`CREATE DATABASE "${database}"`);
  created = true;
  await observer.connect();
  await initializeGateDatabase((sql) => observer.query(sql));
});

beforeEach(async () => {
  first = new Client({ ...target, database });
  second = new Client({ ...target, database });
  await Promise.all([first.connect(), second.connect()]);
  await Promise.all([first, second].map(async (client) => {
    await client.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
    await client.query('set role authenticated');
  }));
});
afterEach(async () => {
  await Promise.all([first?.end(), second?.end()]);
});
afterAll(async () => {
  try {
    await observer.end();
    if (created) await maintenance.query(`DROP DATABASE "${database}" WITH (FORCE)`);
  } finally {
    await maintenance.end();
  }
});

async function ingredient() {
  const id = randomUUID();
  await first.query(
    'insert into public.ingredients(id,name,default_uom) values($1,$2,$3)',
    [id, `Fixture ${id}`, 'lb'],
  );
  return id;
}

/** Confirm a real lock wait before releasing transaction one; no timing-only race assertions. */
async function overlap(
  firstSql: string,
  firstValues: unknown[],
  secondSql: string,
  secondValues: unknown[],
) {
  const pidResult: unknown = await second.query('select pg_backend_pid() as pid');
  const { pid } = z.object({ rows: z.tuple([z.object({ pid: z.number() })]) })
    .parse(pidResult).rows[0];
  await first.query('begin');
  try {
    await first.query(firstSql, firstValues);
    let finished = false;
    const pending = second.query(secondSql, secondValues).then(
      (result) => {
        finished = true;
        return { result: resultRows.parse(result), error: null };
      },
      (error: unknown) => {
        finished = true;
        return { result: null, error };
      },
    );
    await expect.poll(async () => {
      if (finished) throw new Error('Second operation completed without the required overlapping lock');
      const activity: unknown = await observer.query('select wait_event_type from pg_stat_activity where pid=$1', [pid]);
      return z.object({ rows: z.array(z.object({ wait_event_type: z.string().nullable() })) })
        .parse(activity).rows[0]?.wait_event_type;
    }, { timeout: 4000, interval: 25 }).toBe('Lock');
    await first.query('commit');
    return await pending;
  } finally {
    await first.query('rollback');
  }
}

const postInventory = `insert into public.inventory_events
  (ingredient_id,event_type,quantity_delta,uom,reason_note,request_id)
  values($1,'OpeningBalance',1,'lb','Concurrency fixture',$2)`;

it('blocks a unit change until the first inventory posting is committed, then rejects it', async () => {
  const id = await ingredient();
  const outcome = await overlap(
    postInventory,
    [id, randomUUID()],
    "update public.ingredients set default_uom='gal' where id=$1",
    [id],
  );
  expect(outcome.error).toBeInstanceOf(Error);
  expect(String(outcome.error)).toContain('Base unit cannot change');
});

it('waits for a unit change and rejects an inventory posting using the old unit', async () => {
  const id = await ingredient();
  const outcome = await overlap(
    "update public.ingredients set default_uom='gal' where id=$1",
    [id],
    postInventory,
    [id, randomUUID()],
  );
  expect(String(outcome.error)).toContain('Inventory unit must match');
});

async function receiptPayload() {
  const ingredientId = await ingredient();
  const supplierId = randomUUID();
  await first.query(
    'insert into public.suppliers(id,name) values($1,$2)',
    [supplierId, `Fixture ${supplierId}`],
  );
  return {
    ingredient_id: ingredientId,
    supplier_id: supplierId,
    quantity: 2,
    uom: 'lb',
    received_on: '2026-09-19',
    request_id: randomUUID(),
  };
}
const receiptSql = 'select public.post_inventory_receipt($1::jsonb) as id';
it('serializes identical receipt retries into one ledger posting', async () => {
  const payload = await receiptPayload();
  const outcome = await overlap(
    receiptSql,
    [JSON.stringify(payload)],
    receiptSql,
    [JSON.stringify(payload)],
  );
  expect(outcome.error).toBeNull();
  const result: unknown = await observer.query(
    'select count(*)::int as count from public.inventory_events where request_id=$1',
    [payload.request_id],
  );
  expect(resultRows.parse(result).rows).toEqual([{ count: 1 }]);
});
it('rejects a concurrent receipt retry with conflicting values', async () => {
  const payload = await receiptPayload();
  const outcome = await overlap(
    receiptSql,
    [JSON.stringify(payload)],
    receiptSql,
    [JSON.stringify({ ...payload, quantity: 3 })],
  );
  expect(String(outcome.error)).toContain('Request ID already used');
});

async function draftRecipe() {
  const ingredientId = await ingredient();
  const productId = randomUUID();
  const recipeId = randomUUID();
  const versionId = randomUUID();
  const sectionId = randomUUID();
  const lineId = randomUUID();
  await first.query('insert into public.products(id,name) values($1,$2)', [productId, productId]);
  await first.query(
    'insert into public.recipes(id,product_id,name) values($1,$2,$3)',
    [recipeId, productId, recipeId],
  );
  await first.query(
    'insert into public.recipe_versions(id,recipe_id,version_number) values($1,$2,1)',
    [versionId, recipeId],
  );
  await first.query(`insert into public.recipe_sections(id,recipe_version_id,name,sequence)
    values($1,$2,'Fixture',1)`, [sectionId, versionId]);
  await first.query(
    `insert into public.recipe_lines(id,recipe_version_id,recipe_section_id,
    ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
    values($1,$2,$3,$4,'fixture',1,'1 lb',1,'lb')`,
    [lineId, versionId, sectionId, ingredientId],
  );
  return {
    recipeId, versionId, lineId, productId,
  };
}
const releaseSql = "update public.recipe_versions set status='Released',released_by=$1 where id=$2";
it('rejects a recipe edit that overlaps release of its version', async () => {
  const { versionId, lineId } = await draftRecipe();
  const outcome = await overlap(
    releaseSql,
    [actor, versionId],
    'update public.recipe_lines set normalized_quantity=2 where id=$1',
    [lineId],
  );
  expect(String(outcome.error)).toMatch(/immutable|Draft/);
});
it('does not grant administrators direct deletion of draft recipe lines', async () => {
  const { lineId } = await draftRecipe();
  await expect(first.query('delete from public.recipe_lines where id=$1', [lineId]))
    .rejects.toThrow('permission denied for table recipe_lines');
});
it('cannot release after a concurrent edit moves the last line to another draft', async () => {
  const { recipeId, versionId, lineId } = await draftRecipe();
  const destinationVersionId = randomUUID();
  const destinationSectionId = randomUUID();
  await first.query(
    'insert into public.recipe_versions(id,recipe_id,version_number) values($1,$2,2)',
    [destinationVersionId, recipeId],
  );
  await first.query(`insert into public.recipe_sections(id,recipe_version_id,name,sequence)
    values($1,$2,'Destination',1)`, [destinationSectionId, destinationVersionId]);
  // Direct DELETE is deliberately unavailable. A permitted move empties the
  // source draft while exercising the same release-versus-content lock order.
  const outcome = await overlap(
    'update public.recipe_lines set recipe_version_id=$1,recipe_section_id=$2 where id=$3',
    [destinationVersionId, destinationSectionId, lineId],
    releaseSql,
    [actor, versionId],
  );
  expect(String(outcome.error)).toContain('empty recipe');
  const result: unknown = await observer.query(
    'select status from public.recipe_versions where id=$1',
    [versionId],
  );
  expect(resultRows.parse(result).rows).toEqual([{ status: 'Draft' }]);
});

async function purchasingScenario() {
  const { versionId, lineId } = await draftRecipe();
  await first.query(releaseSql, [actor, versionId]);
  const ingredientResult: unknown = await first.query('select ingredient_id from public.recipe_lines where id=$1', [lineId]);
  const ingredientId = z.object({ rows: z.tuple([z.object({ ingredient_id: z.uuid() })]) })
    .parse(ingredientResult).rows[0].ingredient_id;
  const planId = randomUUID();
  const plan = {
    id: planId,
    name: 'Concurrency worksheet',
    needed_on: '2026-10-01',
    batches: [{ recipe_version_id: versionId, batch_count: 40 }],
  };
  return { plan, ingredientId };
}
const savePlanSql = 'select public.save_material_plan($1::jsonb)';
it('serializes identical material-plan retries into one saved commitment', async () => {
  const { plan } = await purchasingScenario();
  const values = [JSON.stringify(plan)];
  const outcome = await overlap(savePlanSql, values, savePlanSql, values);
  expect(outcome.error).toBeNull();
  const result: unknown = await observer.query('select count(*)::int as count from public.material_plans where id=$1', [plan.id]);
  expect(resultRows.parse(result).rows).toEqual([{ count: 1 }]);
});
it('locks base-unit changes behind newly committed material requirements', async () => {
  const { plan, ingredientId } = await purchasingScenario();
  const outcome = await overlap(
    savePlanSql,
    [JSON.stringify(plan)],
    "update public.ingredients set default_uom='gal' where id=$1",
    [ingredientId],
  );
  expect(String(outcome.error)).toContain('Base unit cannot change');
});
it('revalidates recipe units after an overlapping base-unit change', async () => {
  const { plan, ingredientId } = await purchasingScenario();
  const outcome = await overlap(
    "update public.ingredients set default_uom='gal' where id=$1",
    [ingredientId],
    savePlanSql,
    [JSON.stringify(plan)],
  );
  expect(String(outcome.error)).toContain('base unit');
});

async function confirmedPurchase() {
  const { plan, ingredientId } = await purchasingScenario();
  await first.query(savePlanSql, [JSON.stringify(plan)]);
  const supplierId = randomUUID();
  const itemId = randomUUID();
  const draftId = randomUUID();
  await first.query('insert into public.suppliers(id,name) values($1,$2)', [supplierId, supplierId]);
  await first.query(`insert into public.supplier_items(id,supplier_id,ingredient_id,purchase_uom,pack_quantity,pack_quantity_uom)
    values($1,$2,$3,'pail',30,'lb')`, [itemId, supplierId, ingredientId]);
  await first.query('select public.create_purchase_draft($1::jsonb)', [JSON.stringify({
    id: draftId,
    material_plan_id: plan.id,
    supplier_id: supplierId,
    expected_on: '2026-09-30',
    lines: [{
      ingredient_id: ingredientId, supplier_item_id: itemId, purchase_units: 2, override_reason: '',
    }],
  })]);
  await first.query('select public.change_purchase_status($1::jsonb)', [JSON.stringify({
    id: draftId, revision: 1, status: 'Confirmed', reference: 'TEST-CONFIRMED', note: '',
  })]);
  const result: unknown = await first.query('select id from public.purchase_draft_lines where purchase_draft_id=$1', [draftId]);
  const purchaseLineResult = z.object({ rows: z.tuple([z.object({ id: z.uuid() })]) });
  const purchaseLineId = purchaseLineResult.parse(result).rows[0].id;
  const receipt = {
    supplier_id: supplierId,
    ingredient_id: ingredientId,
    quantity: 40,
    uom: 'lb',
    received_on: '2026-09-30',
    supplier_reference: 'TEST-CONFIRMED',
    supplier_lot: 'TEST-LOT',
    expiration_date: '',
    note: '',
    request_id: randomUUID(),
    purchase_draft_line_id: purchaseLineId,
  };
  return { draftId, receipt };
}
it('rejects the second overlapping receipt when total receiving would exceed the purchase', async () => {
  const { receipt } = await confirmedPurchase();
  const outcome = await overlap(
    receiptSql,
    [JSON.stringify(receipt)],
    receiptSql,
    [JSON.stringify({ ...receipt, request_id: randomUUID() })],
  );
  expect(String(outcome.error)).toContain('outstanding inbound quantity');
});
it('prevents cancelling a confirmed purchase after an overlapping receipt commits', async () => {
  const { draftId, receipt } = await confirmedPurchase();
  const outcome = await overlap(
    receiptSql,
    [JSON.stringify(receipt)],
    'select public.change_purchase_status($1::jsonb)',
    [JSON.stringify({
      id: draftId, revision: 2, status: 'Cancelled', reference: 'TEST-CONFIRMED', note: 'Cancellation fixture',
    })],
  );
  expect(String(outcome.error)).toContain('Received purchases cannot be cancelled');
});

async function serializedReceiptPayload() {
  return {
    ...await receiptPayload(),
    supplier_lot: 'CONCURRENT-LOT',
    packages: [{ quantity: 1, supplier_barcode: '' }, { quantity: 1, supplier_barcode: '' }],
  };
}
const serializedReceiptSql = 'select public.receive_serialized_delivery($1::jsonb) as id';
const packageChangeSql = 'select public.change_serialized_unit($1::jsonb) as id';
const multiReceiptSql = 'select public.receive_purchase_delivery($1::jsonb) as id';

async function multiPurchaseDeliveryScenario() {
  const supplierId = randomUUID();
  const ingredientIds = [await ingredient(), await ingredient()];
  const itemIds = [randomUUID(), randomUUID()];
  const draftIds = [randomUUID(), randomUUID()];
  await first.query('insert into public.suppliers(id,name) values($1,$2)', [supplierId, supplierId]);
  await first.query(`insert into public.supplier_items(
    id,supplier_id,ingredient_id,supplier_sku,purchase_uom,pack_quantity,pack_quantity_uom)
    values($1,$2,$3,'FIRST','pail',20,'lb'),($4,$2,$5,'SECOND','pail',20,'lb')`, [
    itemIds[0], supplierId, ingredientIds[0], itemIds[1], ingredientIds[1],
  ]);
  await draftIds.reduce(async (previous, draftId, index) => {
    await previous;
    await first.query('select public.create_purchase_draft($1::jsonb)', [JSON.stringify({
      id: draftId,
      kind: 'standalone',
      material_plan_id: null,
      supplier_id: supplierId,
      expected_on: '2026-09-30',
      lines: [{
        ingredient_id: ingredientIds[index],
        supplier_item_id: itemIds[index],
        purchase_units: 1,
        override_reason: 'Native multi-receiving fixture',
      }],
    })]);
  }, Promise.resolve());
  const savedLines: unknown = await first.query(`select id,purchase_draft_id,ingredient_id,uom
    from public.purchase_draft_lines where purchase_draft_id=any($1::uuid[]) order by purchase_draft_id`, [draftIds]);
  const purchaseLines = z.object({
    rows: z.array(z.object({
      id: z.uuid(), purchase_draft_id: z.uuid(), ingredient_id: z.uuid(), uom: z.string(),
    })).length(2),
  }).parse(savedLines).rows;
  const payload = (requestId = randomUUID()) => ({
    request_id: requestId,
    supplier_id: supplierId,
    received_on: '2026-09-30',
    supplier_reference: 'NATIVE-MULTI',
    note: '',
    lines: purchaseLines.map((line) => ({
      id: randomUUID(),
      purchase_draft_line_id: line.id,
      quantity: 10,
      supplier_lot: '',
      expiration_date: '',
      packages: [{ quantity: 10, supplier_barcode: '' }],
    })),
  });
  return {
    draftIds, payload, purchaseLines, supplierId,
  };
}

it('serializes identical multi-PO delivery retries into one complete receipt', async () => {
  const scenario = await multiPurchaseDeliveryScenario();
  const payload = scenario.payload();
  const outcome = await overlap(
    multiReceiptSql,
    [JSON.stringify(payload)],
    multiReceiptSql,
    [JSON.stringify(payload)],
  );
  expect(outcome.error).toBeNull();
  const result: unknown = await observer.query(`select count(distinct receipt.id)::int receipts,
      count(line.id)::int lines,count(serialization.id)::int serializations
    from public.inventory_receipts receipt
    join public.inventory_receipt_lines line on line.receipt_id=receipt.id
    join public.receipt_serializations serialization on serialization.receipt_line_id=line.id
    where receipt.delivery_request_id=$1`, [payload.request_id]);
  expect(resultRows.parse(result).rows).toEqual([{ receipts: 1, lines: 2, serializations: 2 }]);
});

it('locks overlapping multi-PO deliveries in deterministic order despite reversed input', async () => {
  const scenario = await multiPurchaseDeliveryScenario();
  const firstPayload = scenario.payload();
  const secondPayload = scenario.payload();
  secondPayload.lines.reverse();
  const outcome = await overlap(
    multiReceiptSql,
    [JSON.stringify(firstPayload)],
    multiReceiptSql,
    [JSON.stringify(secondPayload)],
  );
  expect(outcome.error).toBeNull();
  const result: unknown = await observer.query(`select count(*)::int count
    from public.inventory_receipt_lines where purchase_draft_line_id=any($1::uuid[])`, [
    scenario.purchaseLines.map((line) => line.id),
  ]);
  expect(resultRows.parse(result).rows).toEqual([{ count: 4 }]);
});

it('orders fallback-lot and PO locks consistently with a concurrent legacy receipt', async () => {
  const scenario = await multiPurchaseDeliveryScenario();
  const payload = scenario.payload();
  payload.lines = payload.lines.map((line) => ({
    ...line, quantity: 5, packages: [{ quantity: 5, supplier_barcode: '' }],
  }));
  const firstLine = scenario.purchaseLines[0];
  if (!firstLine) throw new Error('Expected a purchase-line fixture.');
  const legacy = {
    request_id: randomUUID(),
    supplier_id: scenario.supplierId,
    ingredient_id: firstLine.ingredient_id,
    quantity: 5,
    uom: firstLine.uom,
    received_on: '2026-09-30',
    supplier_reference: 'NATIVE-LEGACY',
    supplier_lot: '',
    expiration_date: '',
    note: '',
    purchase_draft_line_id: firstLine.id,
  };
  const pidResult: unknown = await second.query('select pg_backend_pid() as pid');
  const { pid } = z.object({ rows: z.tuple([z.object({ pid: z.number() })]) })
    .parse(pidResult).rows[0];
  await first.query(`insert into public.source_lot_daily_sequences(received_on,next_sequence)
    values($1,1) on conflict(organization_id,facility_id,received_on) do nothing`, [legacy.received_on]);
  await first.query('begin');
  try {
    // Hold only the allocator row. If the multi-PO RPC takes a PO lock first,
    // the legacy receipt below produces the historical PO/allocator deadlock.
    await first.query(`select 1 from public.source_lot_daily_sequences
      where organization_id=public.current_org() and facility_id=public.current_facility()
        and received_on=$1 for update`, [legacy.received_on]);
    let finished = false;
    const pending = second.query(multiReceiptSql, [JSON.stringify(payload)]).then(
      (result) => {
        finished = true;
        return { result: resultRows.parse(result), error: null };
      },
      (error: unknown) => {
        finished = true;
        return { result: null, error };
      },
    );
    await expect.poll(async () => {
      if (finished) throw new Error('Multi-PO receipt did not wait on the fallback allocator');
      const activity: unknown = await observer.query(
        'select wait_event_type from pg_stat_activity where pid=$1',
        [pid],
      );
      return z.object({ rows: z.array(z.object({ wait_event_type: z.string().nullable() })) })
        .parse(activity).rows[0]?.wait_event_type;
    }, { timeout: 4000, interval: 25 }).toBe('Lock');
    await first.query(receiptSql, [JSON.stringify(legacy)]);
    await first.query('commit');
    expect((await pending).error).toBeNull();
  } finally {
    await first.query('rollback');
  }
});

it('prevents cancelling a PO after an overlapping multi-PO delivery commits', async () => {
  const scenario = await multiPurchaseDeliveryScenario();
  const payload = scenario.payload();
  const firstDraftId = scenario.draftIds[0];
  if (!firstDraftId) throw new Error('Expected a purchase-draft fixture.');
  const outcome = await overlap(
    multiReceiptSql,
    [JSON.stringify(payload)],
    'select public.change_purchase_status($1::jsonb)',
    [JSON.stringify({
      id: firstDraftId,
      revision: 2,
      status: 'Cancelled',
      reference: `PO-${firstDraftId.replaceAll('-', '').slice(-8).toUpperCase()}`,
      note: 'Concurrent cancellation fixture',
    })],
  );
  expect(String(outcome.error)).toContain('Received purchases cannot be cancelled');
});

it('serializes identical physical receipt retries into one receipt and one set of labels', async () => {
  const payload = await serializedReceiptPayload();
  const outcome = await overlap(
    serializedReceiptSql,
    [JSON.stringify(payload)],
    serializedReceiptSql,
    [JSON.stringify(payload)],
  );
  expect(outcome.error).toBeNull();
  const result: unknown = await first.query(`select count(*)::int as count from public.serialized_units u
    join public.receipt_serializations s on s.id=u.serialization_id
    join public.inventory_receipt_lines l on l.id=s.receipt_line_id where l.ingredient_id=$1`, [payload.ingredient_id]);
  const count = z.object({ rows: z.tuple([z.object({ count: z.number() })]) }).parse(result);
  expect(count.rows[0].count).toBe(2);
});
async function packageChangePayload() {
  const receipt = await serializedReceiptPayload();
  await first.query(serializedReceiptSql, [JSON.stringify(receipt)]);
  const result: unknown = await first.query('select id from public.serialized_unit_balances where ingredient_id=$1 order by ordinal', [receipt.ingredient_id]);
  const unit = z.object({ rows: z.array(z.object({ id: z.uuid() })) }).parse(result).rows[0];
  if (!unit) throw new Error('Package fixture was not created.');
  return {
    id: randomUUID(),
    unit_id: unit.id,
    expected_revision: 0,
    remaining_quantity: 0.5,
    status: 'Hold',
    reason: 'Concurrent quality correction',
  };
}
it('serializes package-change retries and posts the correction exactly once', async () => {
  const payload = await packageChangePayload();
  const outcome = await overlap(
    packageChangeSql,
    [JSON.stringify(payload)],
    packageChangeSql,
    [JSON.stringify(payload)],
  );
  expect(outcome.error).toBeNull();
  const result: unknown = await first.query('select count(*)::int as count from public.inventory_events where serialized_unit_event_id=$1', [payload.id]);
  const count = z.object({ rows: z.tuple([z.object({ count: z.number() })]) }).parse(result);
  expect(count.rows[0].count).toBe(1);
});
it('rejects an overlapping stale package update after the first revision commits', async () => {
  const payload = await packageChangePayload();
  const outcome = await overlap(
    packageChangeSql,
    [JSON.stringify(payload)],
    packageChangeSql,
    [JSON.stringify({ ...payload, id: randomUUID(), status: 'Quarantined' })],
  );
  expect(String(outcome.error)).toContain('Package changed');
});

it('serializes duplicate customer orders into one order and one ingredient commitment', async () => {
  const { recipeId, versionId, productId } = await draftRecipe();
  await first.query(releaseSql, [actor, versionId]);
  await first.query('update public.recipes set active_version_id=$1 where id=$2', [versionId, recipeId]);
  const id = randomUUID();
  const input = JSON.stringify({
    id,
    customer_name: `Customer ${id}`,
    reference: '',
    needed_on: '2026-10-01',
    products: [{ product_id: productId, batch_count: 2, customer_product_option_id: null }],
  });
  const sql = 'select public.save_customer_order($1::jsonb)';
  const outcome = await overlap(sql, [input], sql, [input]);
  expect(outcome.error).toBeNull();
  const result: unknown = await observer.query('select count(*)::int as count from public.customer_orders where id=$1', [id]);
  expect(resultRows.parse(result).rows).toEqual([{ count: 1 }]);
  const plans: unknown = await observer.query('select count(*)::int as count from public.material_plans where id=$1', [id]);
  expect(resultRows.parse(plans).rows).toEqual([{ count: 1 }]);
});

it('rejects an overlapping stale customer-price revision', async () => {
  const { productId } = await draftRecipe();
  const id = randomUUID();
  const input = {
    id,
    revision: 0,
    customer_name: `Customer ${id}`,
    product_id: productId,
    label: 'Bag',
    packaging_mode: 'custom',
    unit_name: 'bag',
    gallons_per_unit: 2,
    unit_price: 12.5,
    currency: 'USD',
    active: true,
  };
  const sql = 'select public.save_customer_product_option($1::jsonb)';
  await first.query(sql, [JSON.stringify(input)]);
  const outcome = await overlap(
    sql,
    [JSON.stringify({ ...input, revision: 1, unit_price: 15 })],
    sql,
    [JSON.stringify({ ...input, revision: 1, unit_price: 18 })],
  );
  expect(String(outcome.error)).toContain('Customer option changed');
});

async function productionOrderPayload() {
  const { recipeId, versionId, productId } = await draftRecipe();
  await first.query(releaseSql, [actor, versionId]);
  await first.query('update public.recipes set active_version_id=$1 where id=$2', [versionId, recipeId]);
  const id = randomUUID();
  await first.query('select public.save_customer_order($1::jsonb)', [JSON.stringify({
    id,
    customer_name: `Production ${id}`,
    reference: '',
    needed_on: '2026-10-01',
    products: [{ product_id: productId, batch_count: 2, customer_product_option_id: null }],
  })]);
  return {
    id,
    revision: 0,
    start_on: '2026-09-28',
    finish_on: '2026-09-30',
    status: 'Draft',
    note: '',
    shortage_reason: '',
  };
}
const productionSql = 'select public.save_order_production_plan($1::jsonb)';
const packagingSql = 'select public.save_packaging_profile($1::jsonb)';
async function packagingPayload() {
  const { productId } = await draftRecipe();
  return {
    id: randomUUID(),
    product_id: productId,
    expected_version: 0,
    status: 'Approved',
    bag_size_gallons: 1,
    bags_per_case: 4,
    label_width_inches: 3,
    label_height_inches: 5,
    display_name: 'Synthetic label',
    ingredient_statement: 'Approved test wording',
  };
}
it('serializes duplicate packaging approvals into one immutable version', async () => {
  const payload = await packagingPayload();
  const values = [JSON.stringify(payload)];
  const outcome = await overlap(packagingSql, values, packagingSql, values);
  expect(outcome.error).toBeNull();
  const result: unknown = await first.query('select count(*)::int count from public.packaging_profile_versions where product_id=$1', [payload.product_id]);
  expect(resultRows.parse(result).rows).toEqual([{ count: 1 }]);
});
it('rejects overlapping packaging edits without replacing approved defaults', async () => {
  const payload = await packagingPayload();
  const outcome = await overlap(
    packagingSql,
    [JSON.stringify(payload)],
    packagingSql,
    [JSON.stringify({ ...payload, id: randomUUID(), bag_size_gallons: 2 })],
  );
  expect(String(outcome.error)).toContain('Packaging setup changed');
  const result: unknown = await first.query('select bag_size_gallons::float gallons from public.products where id=$1', [payload.product_id]);
  expect(resultRows.parse(result).rows).toEqual([{ gallons: 1 }]);
});
it('serializes duplicate production generation into exactly one set of mixer and spice records', async () => {
  const payload = await productionOrderPayload();
  const outcome = await overlap(
    productionSql,
    [JSON.stringify(payload)],
    productionSql,
    [JSON.stringify(payload)],
  );
  expect(outcome.error).toBeNull();
  const result: unknown = await first.query(`select count(*)::int count from public.planned_mixer_batches batch
    join public.planned_spice_preparations prep on prep.planned_mixer_batch_id=batch.id where batch.order_id=$1`, [payload.id]);
  expect(resultRows.parse(result).rows).toEqual([{ count: 2 }]);
});
it('rejects an overlapping production revision with different dates', async () => {
  const payload = await productionOrderPayload();
  await first.query(productionSql, [JSON.stringify(payload)]);
  const outcome = await overlap(
    productionSql,
    [JSON.stringify({ ...payload, revision: 1, start_on: '2026-09-29' })],
    productionSql,
    [JSON.stringify({ ...payload, revision: 1, start_on: '2026-09-27' })],
  );
  expect(String(outcome.error)).toContain('Production plan changed');
});
it('prevents overlapping order cancellation from orphaning newly generated production', async () => {
  const payload = await productionOrderPayload();
  const outcome = await overlap(
    productionSql,
    [JSON.stringify(payload)],
    'select public.cancel_customer_order($1)',
    [payload.id],
  );
  expect(String(outcome.error)).toContain('Cancel production preparation');
});

it('serializes bulk purchasing across distinct requests without duplicate supplier drafts', async () => {
  const { plan, ingredientId } = await purchasingScenario();
  await first.query(savePlanSql, [JSON.stringify(plan)]);
  const supplierId = randomUUID();
  await first.query('insert into public.suppliers(id,name) values($1,$2)', [supplierId, supplierId]);
  await first.query(`insert into public.supplier_items(supplier_id,ingredient_id,purchase_uom,pack_quantity,pack_quantity_uom)
    values($1,$2,'pail',30,'lb')`, [supplierId, ingredientId]);
  const sql = 'select public.generate_demand_purchases($1) as result';
  const request = randomUUID();
  const outcome = await overlap(sql, [request], sql, [randomUUID()]);
  expect(outcome.error).toBeNull();
  const saved: unknown = await first.query(`select count(*)::int count from public.purchase_draft_lines
    where ingredient_id=$1`, [ingredientId]);
  expect(resultRows.parse(saved).rows).toEqual([{ count: 1 }]);
  const initial: unknown = await first.query(sql, [request]);
  const retry: unknown = await second.query(sql, [request]);
  expect(resultRows.parse(retry)).toEqual(resultRows.parse(initial));
});
