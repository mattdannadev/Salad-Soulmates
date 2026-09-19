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
  return { versionId, lineId };
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
it('cannot release after a concurrent edit removes the last recipe line', async () => {
  const { versionId, lineId } = await draftRecipe();
  const outcome = await overlap(
    'delete from public.recipe_lines where id=$1',
    [lineId],
    releaseSql,
    [actor, versionId],
  );
  expect(String(outcome.error)).toContain('empty recipe');
});
