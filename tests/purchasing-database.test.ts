import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  beforeAll, beforeEach, afterEach, afterAll, describe, expect, it,
} from 'vitest';
import { materialAvailabilitySchema } from '@/domain/purchasing';
import { initializeGateDatabase, gateActor } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;
const planInput = (planId = id(800), count = 4, neededOn = '2026-10-01') => ({
  id: planId,
  name: 'Synthetic production worksheet',
  needed_on: neededOn,
  batches: [{ recipe_version_id: id(401), batch_count: count }],
});
const draftInput = (draftId = id(900), units = 2) => ({
  id: draftId,
  material_plan_id: id(800),
  supplier_id: id(200),
  expected_on: '2026-09-30',
  lines: [
    {
      ingredient_id: id(100),
      supplier_item_id: id(201),
      purchase_units: units,
      override_reason: '',
    },
  ],
});
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
async function rpc(name: string, payload: unknown) {
  const allowed = z
    .enum([
      'save_material_plan',
      'create_purchase_draft',
      'change_purchase_status',
      'post_inventory_receipt',
    ])
    .parse(name);
  return query(`select public.${allowed}($1::jsonb) as id`, [JSON.stringify(payload)]);
}
async function requirements(planId = id(800)) {
  const result = await query('select public.material_requirements($1) as requirements', [
    planId,
  ]);
  return z
    .object({ requirements: z.array(materialAvailabilitySchema) })
    .parse(result.rows[0]).requirements;
}
async function confirmDraft() {
  await rpc('create_purchase_draft', draftInput());
  await rpc('change_purchase_status', {
    id: id(900),
    status: 'Confirmed',
    revision: 1,
    reference: 'EXTERNAL-123',
    note: '',
  });
}
async function receiptPayload(quantity = 10, requestId = id(950)) {
  const result = await query(
    'select id from public.purchase_draft_lines where purchase_draft_id=$1',
    [id(900)],
  );
  const line = z.object({ id: z.uuid() }).parse(result.rows[0]);
  return {
    request_id: requestId,
    supplier_id: id(200),
    ingredient_id: id(100),
    quantity,
    uom: 'lb',
    received_on: '2026-09-30',
    supplier_reference: 'EXTERNAL-123',
    supplier_lot: 'LOT-1',
    note: '',
    expiration_date: '',
    purchase_draft_line_id: line.id,
  };
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

describe('materials and purchasing against actual migration SQL', () => {
  it('aggregates pinned recipe quantities, commits planning stock, and never consumes inventory', async () => {
    await rpc('save_material_plan', planInput());
    const first = (await requirements())[0];
    expect(first).toMatchObject({
      required: 40,
      on_hand: 0,
      shortage: 40,
      other_commitments: 0,
    });
    expect(first?.contributions[0]).toMatchObject({
      batch_count: 4,
      per_batch: 10,
      quantity: 40,
    });
    expect((await query('select * from public.inventory_events')).rows).toHaveLength(0);
    await rpc('save_material_plan', planInput(id(801), 2));
    expect((await requirements())[0]).toMatchObject({
      required: 40,
      other_commitments: 20,
      shortage: 60,
    });
  });
  it('retries identical worksheet requests without duplicate commitments and rejects changed retries', async () => {
    await rpc('save_material_plan', planInput());
    await rpc('save_material_plan', planInput());
    expect((await query('select * from public.material_plans')).rows).toHaveLength(1);
    await expect(rpc('save_material_plan', planInput(id(800), 5))).rejects.toThrow(
      'different values',
    );
  });
  it('prevents forged requirement totals through direct table writes', async () => {
    const input = planInput();
    await query(
      'insert into public.material_plans(id,name,needed_on,batches,requirements) values($1,$2,$3,$4,$5)',
      [
        input.id,
        input.name,
        input.needed_on,
        JSON.stringify(input.batches),
        JSON.stringify([{ required: 0 }]),
      ],
    );
    expect((await requirements())[0]?.required).toBe(40);
    await expect(
      query("update public.material_plans set requirements='[]' where id=$1", [input.id]),
    ).rejects.toThrow('immutable');
  });
  it.each([0, -1, 1.5, 10001])(
    'rejects invalid batch count %s in the database',
    async (count) => {
      await expect(rpc('save_material_plan', planInput(id(800), count))).rejects.toThrow(
        'Batch count',
      );
    },
  );
  it('rejects unreleased, unknown and duplicate recipe versions', async () => {
    const input = planInput();
    await expect(
      rpc('save_material_plan', {
        ...input,
        batches: [{ recipe_version_id: id(999), batch_count: 1 }],
      }),
    ).rejects.toThrow('released recipe');
    await expect(
      rpc('save_material_plan', {
        ...input,
        batches: [...input.batches, ...input.batches],
      }),
    ).rejects.toThrow('only once');
  });
  it('rejects unvalidated recipe units rather than silently converting', async () => {
    await query("update public.ingredients set default_uom='gal' where id=$1", [id(100)]);
    await expect(rpc('save_material_plan', planInput())).rejects.toThrow('base unit');
  });
  it('locks ingredient base units after worksheet history exists', async () => {
    await rpc('save_material_plan', planInput());
    await expect(
      query("update public.ingredients set default_uom='gal' where id=$1", [id(100)]),
    ).rejects.toThrow('Base unit cannot change');
  });
  it('calculates 70 lb shortage and rounds to three 30 lb pails', async () => {
    await rpc('save_material_plan', planInput(id(800), 18));
    await query(
      `insert into public.inventory_events(ingredient_id,event_type,quantity_delta,uom,reason_note,request_id)
      values($1,'OpeningBalance',50,'lb','Synthetic stock',$2)`,
      [id(100), id(700)],
    );
    await rpc('create_purchase_draft', {
      ...draftInput(),
      lines: [
        {
          ...draftInput().lines[0],
          purchase_units: 2,
          override_reason: 'Part already ordered',
        },
      ],
    });
    await rpc('change_purchase_status', {
      id: id(900),
      revision: 1,
      status: 'Confirmed',
      reference: 'SUPPLY',
      note: '',
    });
    expect((await requirements())[0]).toMatchObject({
      required: 180,
      on_hand: 50,
      confirmed_inbound: 60,
      shortage: 70,
    });
  });
  it('saves pack snapshots, requires override reasons, and rejects duplicate supplier drafts', async () => {
    await rpc('save_material_plan', planInput());
    await expect(rpc('create_purchase_draft', draftInput(id(900), 1))).rejects.toThrow(
      'override requires',
    );
    await rpc('create_purchase_draft', draftInput());
    await rpc('create_purchase_draft', draftInput());
    expect(
      (
        await query(
          'select raw_shortage,pack_quantity,recommended_units,quantity from public.purchase_draft_lines',
        )
      ).rows[0],
    ).toMatchObject({
      raw_shortage: '40',
      pack_quantity: '30.0000',
      recommended_units: 2,
      quantity: '60.0000',
    });
    await query('update public.supplier_items set pack_quantity=99 where id=$1', [
      id(201),
    ]);
    expect(
      (await query('select pack_quantity from public.purchase_draft_lines')).rows[0],
    ).toMatchObject({ pack_quantity: '30.0000' });
    await expect(rpc('create_purchase_draft', draftInput(id(901)))).rejects.toThrow(
      'one_open_supplier_draft',
    );
  });
  it('blocks incompatible supplier units and fractional purchase units', async () => {
    await rpc('save_material_plan', planInput());
    await expect(rpc('create_purchase_draft', draftInput(id(900), 1.2))).rejects.toThrow(
      'whole numbers',
    );
    await query("update public.supplier_items set pack_quantity_uom='gal' where id=$1", [
      id(201),
    ]);
    await expect(rpc('create_purchase_draft', draftInput())).rejects.toThrow('base unit');
  });
  it('counts only confirmed inbound due within the horizon and requires an external reference', async () => {
    await rpc('save_material_plan', planInput());
    await rpc('create_purchase_draft', { ...draftInput(), expected_on: '2026-10-02' });
    expect((await requirements())[0]?.confirmed_inbound).toBe(0);
    await expect(
      rpc('change_purchase_status', {
        id: id(900),
        revision: 1,
        status: 'Confirmed',
        reference: '',
        note: '',
      }),
    ).rejects.toThrow('external order reference');
    await rpc('change_purchase_status', {
      id: id(900),
      revision: 1,
      status: 'Confirmed',
      reference: 'LATE',
      note: '',
    });
    expect((await requirements())[0]?.confirmed_inbound).toBe(0);
  });
  it('supports partial receiving without double-counting supply and retries without duplicate receipts', async () => {
    await rpc('save_material_plan', planInput());
    await confirmDraft();
    const payload = await receiptPayload();
    await actAs(id(3));
    await rpc('post_inventory_receipt', payload);
    await rpc('post_inventory_receipt', payload);
    await actAs(gateActor);
    expect((await requirements())[0]).toMatchObject({
      on_hand: 10,
      confirmed_inbound: 50,
      shortage: 0,
    });
    expect((await query('select * from public.inventory_events')).rows).toHaveLength(1);
    await expect(
      rpc('post_inventory_receipt', { ...payload, purchase_draft_line_id: null }),
    ).rejects.toThrow('different values');
  });
  it('rejects over-receiving and prevents cancellation after a receipt', async () => {
    await rpc('save_material_plan', planInput());
    await confirmDraft();
    await expect(rpc('post_inventory_receipt', await receiptPayload(61))).rejects.toThrow(
      'outstanding inbound',
    );
    expect((await query('select * from public.inventory_receipts')).rows).toHaveLength(0);
    await rpc('post_inventory_receipt', await receiptPayload(60));
    expect((await requirements())[0]).toMatchObject({
      on_hand: 60,
      confirmed_inbound: 0,
    });
    await expect(
      rpc('change_purchase_status', {
        id: id(900),
        revision: 2,
        status: 'Cancelled',
        reference: 'EXTERNAL-123',
        note: 'Cancel remainder',
      }),
    ).rejects.toThrow('cannot be cancelled');
  });
  it('releases commitments only after open purchases are cancelled and detects stale updates', async () => {
    await rpc('save_material_plan', planInput());
    await rpc('create_purchase_draft', draftInput());
    await expect(
      query("update public.material_plans set status='Cancelled' where id=$1", [id(800)]),
    ).rejects.toThrow('Cancel linked draft purchases');
    const cancel = {
      id: id(900),
      status: 'Cancelled',
      revision: 1,
      reference: '',
      note: 'No longer needed',
    };
    await rpc('change_purchase_status', cancel);
    await rpc('change_purchase_status', cancel);
    await expect(
      rpc('change_purchase_status', { ...cancel, note: 'Changed stale request' }),
    ).rejects.toThrow('Purchase changed');
    await query("update public.material_plans set status='Cancelled' where id=$1", [
      id(800),
    ]);
    expect(await requirements()).toEqual([]);
  });
  it('enforces facility isolation and read-only reviewer permissions', async () => {
    await rpc('save_material_plan', planInput());
    await rpc('create_purchase_draft', draftInput());
    await actAs(id(2));
    expect((await requirements())[0]?.required).toBe(40);
    await expect(rpc('create_purchase_draft', draftInput(id(901)))).rejects.toThrow(
      'permission',
    );
    await actAs(id(4));
    expect((await query('select * from public.material_plans')).rows).toHaveLength(0);
    expect((await query('select * from public.purchase_draft_lines')).rows).toHaveLength(
      0,
    );
    expect(await requirements()).toEqual([]);
  });
  it('enables RLS and denies direct execution of privileged trigger helpers', async () => {
    await database.exec('reset role');
    const policies = await database.query<{
      relrowsecurity: boolean;
    }>(`select relrowsecurity from pg_class
      where relname in ('material_plans','purchase_drafts','purchase_draft_lines')`);
    expect(policies.rows).toHaveLength(3);
    expect(policies.rows.every((row) => row.relrowsecurity)).toBe(true);
    await actAs(gateActor);
    await expect(query('select public.validate_purchase_receipt()')).rejects.toThrow(
      'permission denied',
    );
    await expect(query('delete from public.material_plans')).rejects.toThrow(
      'permission denied',
    );
  });
});
