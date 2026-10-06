import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';
import {
  afterAll,
  beforeAll,
  describe,
  expect,
  it,
} from 'vitest';
import { z } from 'zod';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const organizationId = id(10);
const facilityId = id(11);
let database: PGlite;

async function query(sql: string, values: unknown[] = []) {
  return database.query(sql, values);
}

async function rpc(name: string, payload: unknown) {
  const result = await database.query<{ value: unknown }>(
    `select public.${name}($1::jsonb) value`,
    [JSON.stringify(payload)],
  );
  const row = result.rows[0];
  if (!row) throw new Error('The production generation returned no result');
  return row.value;
}

describe('applied production generation', () => {
  beforeAll(async () => {
    database = new PGlite();
    await initializeGateDatabase((sql) => database.exec(sql));
    await database.exec(
      await readFile('supabase/migrations/20261006000717_executable_work_order_scope.sql', 'utf8'),
    );
    await database.exec(
      await readFile(
        'supabase/migrations/20261006020000_applied_production_generation.sql',
        'utf8',
      ),
    );
    await database.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
    await database.exec(`set role authenticated;
      insert into public.ingredients(id,name,default_uom) values('${id(100)}','Fixture ingredient','lb');
      insert into public.products(id,name,ingredient_prep_minutes_per_batch,ingredient_prep_crew_size,mixing_minutes_per_batch,mixing_crew_size)
        values('${id(300)}','Fixture dressing',10,1,20,2);
      insert into public.recipes(id,product_id,name) values('${id(400)}','${id(300)}','Fixture formula');
      insert into public.recipe_versions(id,recipe_id,version_number) values('${id(401)}','${id(400)}',1);
      insert into public.recipe_sections(id,recipe_version_id,name,sequence) values('${id(402)}','${id(401)}','Ingredients',1);
      insert into public.recipe_lines(recipe_version_id,recipe_section_id,ingredient_id,source_line_key,sequence,display_measurement,normalized_quantity,normalized_uom)
        values('${id(401)}','${id(402)}','${id(100)}','TEST-1',1,'10 lb',10,'lb');
      update public.recipe_versions set status='Released',released_by='${gateActor}' where id='${id(401)}';
      update public.recipes set active_version_id='${id(401)}' where id='${id(400)}';
      reset role;
      insert into public.work_plans(id,organization_id,facility_id,code,created_by)
        values('${id(500)}','${organizationId}','${facilityId}','standard_production','${gateActor}');
      insert into public.work_plan_versions(id,organization_id,facility_id,work_plan_id,version_number,name,created_by)
        values('${id(501)}','${organizationId}','${facilityId}','${id(500)}',1,'Standard production','${gateActor}');
      insert into public.work_plan_steps(id,organization_id,facility_id,work_plan_version_id,step_key,title,materialization_policy,sort_order)
        values('${id(502)}','${organizationId}','${facilityId}','${id(501)}','prep','Prep','work_order',10),
          ('${id(503)}','${organizationId}','${facilityId}','${id(501)}','mix','Mix','work_order',20),
          ('${id(504)}','${organizationId}','${facilityId}','${id(501)}','pack','Package','work_order',30);
      insert into public.work_plan_step_dependencies(organization_id,facility_id,work_plan_version_id,predecessor_step_id,successor_step_id,created_by)
        values('${organizationId}','${facilityId}','${id(501)}','${id(502)}','${id(503)}','${gateActor}'),
          ('${organizationId}','${facilityId}','${id(501)}','${id(503)}','${id(504)}','${gateActor}');
      update public.work_plan_versions set state='released',released_by='${gateActor}',released_at=now()
        where id='${id(501)}';
      set role authenticated;`);
    await rpc('save_customer_order', {
      id: id(800),
      customer_name: 'Fixture customer',
      reference: 'APPLIED-TEST',
      needed_on: '2030-10-18',
      products: [{ product_id: id(300), batch_count: 2, customer_product_option_id: null }],
    });
  }, 60000);

  afterAll(async () => database.close());

  it('creates one immutable released-plan snapshot and aggregate packages with the reviewed generation', async () => {
    const preview = z
      .object({ fingerprint: z.string() })
      .parse(await rpc('preview_order_production_work', { order_id: id(800) }));
    const created = await rpc('create_order_production_work', {
      order_id: id(800),
      fingerprint: preview.fingerprint,
    });
    expect(created).toMatchObject({ created: true, batch_count: 2 });
    await database.exec('reset role');
    expect(
      (
        await query(`select work_plan_version_id,source_type,source_id,definition_snapshot->>'name' name
      from public.applied_work_plans`)
      ).rows,
    ).toEqual([
      {
        work_plan_version_id: id(501),
        source_type: 'customer_order',
        source_id: id(800),
        name: 'Standard production',
      },
    ]);
    expect(
      (
        await query(
          `select count(*)::int count, bool_and(work_package_id is not null) attached
      from public.workforce_work_queue_items where linked_task_id=$1`,
          [id(800)],
        )
      ).rows,
    ).toEqual([{ count: 5, attached: true }]);
    expect(
      (
        await query(`select kind, count(*)::int count from public.workforce_work_queue_items
          where linked_task_id=$1 group by kind order by kind`, [id(800)])
      ).rows,
    ).toEqual([
      { kind: 'ingredient_prep', count: 1 },
      { kind: 'mixing', count: 1 },
      { kind: 'packaging', count: 1 },
      { kind: 'post_op', count: 1 },
      { kind: 'pre_op', count: 1 },
    ]);
    expect((await query('select count(*)::int count from public.work_order_dependencies')).rows)
      .toEqual([{ count: 4 }]);
    expect(
      (
        await query(`select operation_kind,planned_quantity,planned_unit from public.work_packages
      order by case operation_kind
        when 'ingredient_prep' then 1 when 'pre_op' then 2 when 'mixing' then 3
        when 'post_op' then 4 when 'packaging' then 5 end`)
      ).rows,
    ).toEqual([
      { operation_kind: 'ingredient_prep', planned_quantity: '2.00', planned_unit: 'batch' },
      { operation_kind: 'pre_op', planned_quantity: '2.00', planned_unit: 'batch' },
      { operation_kind: 'mixing', planned_quantity: '2.00', planned_unit: 'batch' },
      { operation_kind: 'post_op', planned_quantity: '2.00', planned_unit: 'batch' },
      { operation_kind: 'packaging', planned_quantity: '2.00', planned_unit: 'batch' },
    ]);
  });
});
