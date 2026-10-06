import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll, afterAll, describe, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;
async function rpc(name: string, payload: unknown) {
  const result = await database.query<{ result: Record<string, unknown> }>(`select public.${name}($1::jsonb) result`, [JSON.stringify(payload)]);
  const row = result.rows[0];
  if (!row) throw new Error('The order workflow returned no result');
  return row.result;
}

describe('reviewed order production and permanent deletion', () => {
  beforeAll(async () => {
    database = new PGlite();
    await initializeGateDatabase((sql) => database.exec(sql));
    await database.exec(`insert into auth.users(id) values('${id(2)}');
      insert into public.facilities(id,organization_id,name) values('${id(12)}','${id(10)}','Other facility');
      insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(2)}','${id(10)}','${id(12)}','Other administrator','admin',id
      from public.access_profiles where name='Administrator';`);
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
      update public.recipes set active_version_id='${id(401)}' where id='${id(400)}';`);
    await rpc('save_customer_order', {
      id: id(800),
      customer_name: 'Fixture customer',
      reference: 'DELETE-TEST',
      needed_on: '2030-10-18',
      products: [{ product_id: id(300), batch_count: 40, customer_product_option_id: null }],
    });
    await rpc('save_customer_order', {
      id: id(801),
      customer_name: 'Fixture customer',
      reference: 'KEEP-TEST',
      needed_on: '2030-10-18',
      products: [{ product_id: id(300), batch_count: 1, customer_product_option_id: null }],
    });
  }, 60000);
  afterAll(async () => database.close());

  it('previews without writes, splits capacity, confirms once and rejects changed proposals', async () => {
    const preview = await rpc('preview_order_production_work', { order_id: id(800) });
    expect(preview.can_confirm).toBe(true);
    expect(preview.finish_on).toBe('2030-10-16');
    expect(preview.total_batches).toBe(40);
    expect(preview.events).toEqual(expect.arrayContaining([
      expect.objectContaining({ kind: 'mixing', batch_count: 18 }),
      expect.objectContaining({ kind: 'mixing', batch_count: 4 }),
      expect.objectContaining({ kind: 'packaging', work_on: '2030-10-16' }),
    ]));
    expect((await database.query('select count(*)::integer count from public.order_production_plans')).rows).toEqual([{ count: 0 }]);
    await expect(rpc('create_order_production_work', { order_id: id(800), fingerprint: 'stale' })).rejects.toThrow('changed');
    const created = await rpc('create_order_production_work', { order_id: id(800), fingerprint: preview.fingerprint });
    expect(created).toMatchObject({ created: true, batch_count: 40, event_count: 7 });
    expect(await rpc('create_order_production_work', { order_id: id(800), fingerprint: preview.fingerprint })).toMatchObject({ created: false, event_count: 7 });
    await database.exec('reset role');
    expect((await database.query(`select
      (select count(*)::integer from public.planned_mixer_batches) batches,
      (select count(*)::integer from public.workforce_work_queue_items) work,
      (select count(*)::integer from public.workforce_schedule_events) events,
      (select count(*)::integer from public.work_order_dependencies) dependencies`)).rows).toEqual([
      {
        batches: 40, work: 7, events: 7, dependencies: 6,
      },
    ]);
    await database.exec('set role authenticated');
  });

  it('shows exact delete counts, rejects wrong confirmation, and removes only selected order descendants', async () => {
    await database.exec(`reset role;
      update public.products set production_lot_identifier='FIX' where id='${id(300)}';
      insert into public.production_batches(id,organization_id,facility_id,planned_mixer_batch_id,product_id,recipe_version_id,
        local_production_date,run_sequence,run_code,product_name_snapshot,recipe_name_snapshot,recipe_version_snapshot,idempotency_key)
      select '${id(910)}',organization_id,facility_id,id,product_id,recipe_version_id,
        '2030-10-15',1,'FIX-20301015-0001','Fixture dressing','Fixture formula',1,'${id(911)}'
      from public.planned_mixer_batches where order_id='${id(800)}' order by sequence limit 1;`);
    await expect(database.exec(`delete from public.production_batches where id='${id(910)}'`)).rejects.toThrow('cannot be deleted');
    await database.exec('set role authenticated');
    const preview = await rpc('preview_delete_customer_order', { order_id: id(800) });
    expect(preview.can_delete).toBe(true);
    expect(preview.counts).toEqual(expect.arrayContaining([
      { table_name: 'planned_mixer_batches', count: 40 },
      { table_name: 'planned_spice_preparations', count: 40 },
      { table_name: 'workforce_schedule_events', count: 7 },
      { table_name: 'production_batches', count: 1 },
    ]));
    await expect(rpc('delete_customer_order', { order_id: id(800), fingerprint: preview.fingerprint, confirmation: 'WRONG' })).rejects.toThrow('exact order reference');
    await expect(rpc('delete_customer_order', { order_id: id(800), fingerprint: 'stale', confirmation: 'DELETE-TEST' })).rejects.toThrow('changed');
    expect(await rpc('delete_customer_order', { order_id: id(800), fingerprint: preview.fingerprint, confirmation: 'DELETE-TEST' })).toMatchObject({ deleted: true });
    expect(await rpc('delete_customer_order', { order_id: id(800), fingerprint: preview.fingerprint, confirmation: 'DELETE-TEST' })).toMatchObject({ deleted: true });
    await database.exec('reset role');
    expect((await database.query(`select
      (select count(*)::integer from public.customer_orders) orders,
      (select count(*)::integer from public.planned_mixer_batches) batches,
      (select count(*)::integer from public.workforce_work_queue_items) work,
      (select count(*)::integer from public.workforce_schedule_events) events,
      (select count(*)::integer from public.audit_events where event_type='PERMANENT_DELETE') audits`)).rows).toEqual([
      {
        orders: 1, batches: 0, work: 0, events: 0, audits: 1,
      },
    ]);
    await database.exec('set role authenticated');
  }, 30000);

  it('denies anonymous, cross-facility and unavailable order access', async () => {
    await database.exec('reset role');
    await database.query("select set_config('request.jwt.claim.sub','',false)");
    await database.exec('set role authenticated');
    await expect(rpc('preview_delete_customer_order', { order_id: id(801) })).rejects.toThrow('permission');
    await expect(rpc('preview_order_production_work', { order_id: id(801) })).rejects.toThrow('permission');
    await database.exec('reset role');
    await database.query("select set_config('request.jwt.claim.sub',$1,false)", [id(2)]);
    await database.exec('set role authenticated');
    await expect(rpc('preview_delete_customer_order', { order_id: id(801) })).rejects.toThrow('unavailable');
    await expect(rpc('preview_order_production_work', { order_id: id(801) })).rejects.toThrow('unavailable');
    await database.exec('reset role');
    await database.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
    await database.exec('set role authenticated');
    await expect(rpc('preview_delete_customer_order', { order_id: id(999) })).rejects.toThrow('unavailable');
  });

  it('recalculates requested start and product workdays without writes and confirms the exact adjusted proposal', async () => {
    await rpc('save_customer_order', {
      id: id(802),
      customer_name: 'Fixture customer',
      reference: 'ADJUSTED-TEST',
      needed_on: '2030-10-18',
      products: [{ product_id: id(300), batch_count: 40, customer_product_option_id: null }],
    });
    const baseline = await rpc('preview_order_production_work', { order_id: id(802) });
    expect(baseline.product_days).toEqual([{ product_id: id(300), product_name: 'Fixture dressing', workdays: 3 }]);
    const adjustments = {
      order_id: id(802),
      production_start_on: '2030-10-01',
      product_days: [{ product_id: id(300), workdays: 4 }],
    };
    const preview = await rpc('preview_order_production_work', adjustments);
    expect(preview).toMatchObject({ start_on: '2030-10-01', finish_on: '2030-10-08', can_confirm: true });
    expect(preview.fingerprint).not.toBe(baseline.fingerprint);
    expect(preview.events).toEqual(expect.arrayContaining([
      expect.objectContaining({
        kind: 'mixing', work_on: '2030-10-02', batch_count: 10, required_worker_count: 2,
      }),
      expect.objectContaining({ kind: 'mixing', work_on: '2030-10-07', batch_count: 10 }),
      expect.objectContaining({ kind: 'packaging', work_on: '2030-10-08', batch_count: 40 }),
    ]));
    expect((await database.query('select count(*)::integer count from public.order_production_plans')).rows).toEqual([{ count: 0 }]);
    await expect(rpc('create_order_production_work', { order_id: id(802), fingerprint: preview.fingerprint })).rejects.toThrow('changed');
    expect(await rpc('create_order_production_work', { ...adjustments, fingerprint: preview.fingerprint })).toMatchObject({ created: true, event_count: 9 });
    expect(await rpc('create_order_production_work', { ...adjustments, fingerprint: preview.fingerprint })).toMatchObject({ created: false, event_count: 9 });
    expect((await database.query(`select start_on::text,finish_on::text from public.order_production_plans where id='${id(802)}'`)).rows)
      .toEqual([{ start_on: '2030-10-01', finish_on: '2030-10-08' }]);
  });

  it('blocks insufficient requested mixing days and dates that breach the pickup buffer', async () => {
    await rpc('save_customer_order', {
      id: id(803),
      customer_name: 'Fixture customer',
      reference: 'ADJUSTMENT-LIMITS',
      needed_on: '2031-10-17',
      products: [{ product_id: id(300), batch_count: 40, customer_product_option_id: null }],
    });
    const tooFewDays = { order_id: id(803), product_days: [{ product_id: id(300), workdays: 1 }] };
    const capacity = await rpc('preview_order_production_work', tooFewDays);
    expect(capacity.can_confirm).toBe(false);
    expect(capacity.warnings).toEqual(expect.arrayContaining([expect.stringContaining('needs 3 mixing workdays')]));
    await expect(rpc('create_order_production_work', { ...tooFewDays, fingerprint: capacity.fingerprint })).rejects.toThrow('warnings');
    const late = await rpc('preview_order_production_work', { order_id: id(803), production_start_on: '2031-10-15' });
    expect(late.can_confirm).toBe(false);
    expect(late.warnings).toEqual(expect.arrayContaining([expect.stringContaining('finishes too late')]));
    const past = await rpc('preview_order_production_work', { order_id: id(803), production_start_on: '2000-10-02' });
    expect(past.can_confirm).toBe(false);
    expect((await database.query(`select count(*)::integer count from public.order_production_plans where id='${id(803)}'`)).rows).toEqual([{ count: 0 }]);
  });

  it('rejects invalid adjustments and products outside the order', async () => {
    const preview = (adjustments: Record<string, unknown>) => rpc('preview_order_production_work', { order_id: id(803), ...adjustments });
    await expect(preview({ production_start_on: '2030-10-05' })).rejects.toThrow('Monday through Friday');
    await expect(preview({ production_start_on: null })).rejects.toThrow('valid production start');
    await expect(preview({ product_days: [{ product_id: id(300), workdays: 0 }] })).rejects.toThrow('valid mixing workdays');
    await expect(preview({ product_days: [{ product_id: id(300), workdays: 41 }] })).rejects.toThrow('batch count');
    await expect(preview({ product_days: [{ product_id: id(999), workdays: 1 }] })).rejects.toThrow('product from this order');
    await expect(preview({ product_days: [{ product_id: id(300), workdays: 3 }, { product_id: id(300), workdays: 4 }] })).rejects.toThrow('once per product');
  });
});
