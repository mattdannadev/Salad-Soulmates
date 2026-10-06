import { readFileSync } from 'node:fs';
import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';

it.each(['2026-10-01', '2026-10-02', '2026-10-05'])('seeds five assigned weekday prep/mix/package cycles and final pickups from %s', async (startOn) => {
  const db = new PGlite();
  const seed = readFileSync('supabase/seed.sql', 'utf8');
  const block = seed.split('-- BEGIN LOCAL STAGGERED WORK ORDERS')[1]?.split('-- END LOCAL STAGGERED WORK ORDERS')[0];
  const dateSql = seed.slice(seed.indexOf('create temp table sample_dates'), seed.indexOf('-- The local demo deliberately reuses the production master-data snapshot.'))
    .replace('on commit drop', '').replace('now()', `'${startOn} 12:00:00-05'::timestamptz`);
  expect(block).toBeTruthy();
  expect(seed).toContain('"reference":"JDL-PO-10482","products":[{"product_id":"498601a9-c0d3-496d-b485-36fbc2d64a2e","batch_count":126');
  expect(seed).toContain('"reference":"JFM-PO-77831","products":[{"product_id":"abbdd137-b52c-44ed-b677-a4a2e87a5598","batch_count":127');
  if (!block) throw new Error('Staggered sample-work seed is missing');
  try {
    await db.exec(`
      create schema auth;
      create function auth.uid() returns uuid language sql as $$ select '10000000-0000-4000-8000-000000000001'::uuid $$;
      create table profiles (id uuid, organization_id uuid, facility_id uuid);
      create table facilities (id uuid, timezone text);
      create table customer_orders (id uuid, organization_id uuid, facility_id uuid, customer_id uuid, reference text, needed_on date);
      create table planned_mixer_batches (id uuid, order_id uuid, product_id uuid, production_lot_id uuid, sequence integer);
      create table workforce_work_queue_items (
        id uuid primary key, organization_id uuid, facility_id uuid, work_on date, kind text, title text, instructions text,
        batch_quota integer, planned_batch_count numeric, estimated_minutes numeric, required_worker_count integer, linked_task_type text, linked_task_id uuid,
        start_at timestamptz, end_at timestamptz, all_day boolean, timezone text, product_id uuid, customer_id uuid, location_label text,
        publication_state text, status text, published_by uuid, published_at timestamptz, created_by uuid, updated_by uuid
      );
      create table workforce_work_queue_claims (
        organization_id uuid, facility_id uuid, queue_item_id uuid, worker_id uuid, claim_source text,
        primary key (queue_item_id, worker_id)
      );
      create table workforce_work_queue_history (
        organization_id uuid, facility_id uuid, queue_item_id uuid, action text, actor_user_id uuid, after_data jsonb
      );
      create table workforce_schedule_events (
        id uuid primary key, organization_id uuid, facility_id uuid, start_on date, end_on date,
        start_at timestamptz, end_at timestamptz, all_day boolean, timezone text, kind text,
        required_worker_count integer, title text, production_plan_id uuid, planned_batch_count numeric,
        linked_task_type text, linked_task_id uuid, product_id uuid, customer_id uuid, location_label text,
        availability_override_reason text, created_by uuid, updated_by uuid
      );
      create table workforce_schedule_assignments (
        organization_id uuid, facility_id uuid, event_id uuid, employee_id uuid,
        primary key (event_id, employee_id)
      );
      insert into profiles values (auth.uid(), '10000000-0000-4000-8000-000000000010', '10000000-0000-4000-8000-000000000011');
      insert into facilities values ('10000000-0000-4000-8000-000000000011', 'America/Chicago');
      ${dateSql}
      insert into customer_orders select ('10000000-0000-4000-8000-000000000' || order_number)::uuid,
        profile.organization_id, profile.facility_id, md5(order_number::text)::uuid, 'Order ' || order_number,
        (select case when order_number = 621 then ranch_pickup else italian_pickup end from sample_dates)
      from profiles profile cross join generate_series(621, 622) order_number;
      insert into planned_mixer_batches select md5(order_record.id::text || batch_number)::uuid,
        order_record.id, md5('product')::uuid, md5(order_record.id::text || ':lot')::uuid, batch_number
      from customer_orders order_record cross join lateral generate_series(1,
        case when order_record.reference = 'Order 621' then 126 else 127 end) batch_number;
    `);
    // Exercise canonical work and its scheduling projection with PostgreSQL.
    // Publication itself is covered by the production RPC integration suite.
    await db.exec('begin');
    await db.exec(block.split('-- The existing scheduling workspace')[0] ?? '');
    const projection = block.split('-- The existing scheduling workspace')[1]?.split('set local role authenticated;')[0];
    if (!projection) throw new Error('Schedule projection is missing from the seed');
    await db.exec(`-- The existing scheduling workspace${projection}`);
    expect((await db.query(`select count(*)::int as count from workforce_schedule_events event
      join workforce_work_queue_items work on work.id = event.id
      where event.planned_batch_count is not distinct from work.planned_batch_count
        and event.start_on = work.work_on
        and (select count(*) from workforce_schedule_assignments assignment where assignment.event_id = event.id) = 1`)).rows)
      .toEqual([{ count: 32 }]);
    expect((await db.query('select kind, count(*)::int as count from workforce_work_queue_items group by kind order by kind')).rows)
      .toEqual([
        { kind: 'ingredient_prep', count: 10 }, { kind: 'mixing', count: 10 },
        { kind: 'packaging', count: 10 }, { kind: 'shipment_loading', count: 2 },
      ]);
    expect((await db.query(`select count(*)::int as count from sample_work_cycles cycle
      join workforce_work_queue_items prep on prep.id = pg_temp.sample_work_id(cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':ingredient_prep')
      join workforce_work_queue_items mix on mix.id = pg_temp.sample_work_id(cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':mixing')
      join workforce_work_queue_items pack on pack.id = pg_temp.sample_work_id(cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':packaging')
      where mix.work_on = (select min(work_on) from sample_work_days where work_on > prep.work_on)
        and pack.work_on = (select min(work_on) from sample_work_days where work_on > mix.work_on)
        and prep.batch_quota = mix.batch_quota and mix.batch_quota = mix.planned_batch_count
        and prep.planned_batch_count = mix.planned_batch_count
        and mix.planned_batch_count = pack.planned_batch_count`)).rows).toEqual([{ count: 10 }]);
    expect((await db.query(`select cycle.order_id, work.kind, sum(work.planned_batch_count)::float as batches
      from sample_work_cycles cycle
      join workforce_work_queue_items work on work.id = pg_temp.sample_work_id(
        cycle.order_id::text || ':cycle:' || cycle.cycle_number || ':' || work.kind)
      group by cycle.order_id, work.kind order by cycle.order_id, work.kind`)).rows).toEqual([
      { order_id: '10000000-0000-4000-8000-000000000621', kind: 'ingredient_prep', batches: 126 },
      { order_id: '10000000-0000-4000-8000-000000000621', kind: 'mixing', batches: 126 },
      { order_id: '10000000-0000-4000-8000-000000000621', kind: 'packaging', batches: 126 },
      { order_id: '10000000-0000-4000-8000-000000000622', kind: 'ingredient_prep', batches: 127 },
      { order_id: '10000000-0000-4000-8000-000000000622', kind: 'mixing', batches: 127 },
      { order_id: '10000000-0000-4000-8000-000000000622', kind: 'packaging', batches: 127 },
    ]);
    expect((await db.query(`select count(*)::int as count from workforce_work_queue_items
      where kind in ('ingredient_prep', 'mixing', 'packaging') and planned_batch_count > 0`)).rows)
      .toEqual([{ count: 30 }]);
    expect((await db.query(`select cycle.order_id, array_agg(batch.sequence order by cycle.cycle_number) as first_batches
      from sample_work_cycles cycle join planned_mixer_batches batch on batch.id = cycle.batch_id
      group by cycle.order_id order by cycle.order_id`)).rows).toEqual([
      { order_id: '10000000-0000-4000-8000-000000000621', first_batches: [1, 25, 50, 75, 101] },
      { order_id: '10000000-0000-4000-8000-000000000622', first_batches: [1, 25, 50, 75, 101] },
    ]);
    expect((await db.query(`select order_id, array_agg(planned_batch_count order by cycle_number) as daily_batches
      from sample_work_cycles group by order_id order by order_id`)).rows).toEqual([
      { order_id: '10000000-0000-4000-8000-000000000621', daily_batches: [24, 25, 25, 26, 26] },
      { order_id: '10000000-0000-4000-8000-000000000622', daily_batches: [24, 25, 25, 26, 27] },
    ]);
    expect((await db.query(`select order_id, count(*)::int as count, count(distinct mixing_on)::int as days
      from sample_work_cycles group by order_id order by order_id`)).rows)
      .toEqual([
        { order_id: '10000000-0000-4000-8000-000000000621', count: 5, days: 5 },
        { order_id: '10000000-0000-4000-8000-000000000622', count: 5, days: 5 },
      ]);
    expect((await db.query(`select count(*)::int as count from workforce_work_queue_items work
      where required_worker_count = 1 and publication_state = 'published' and status = 'claimed'
        and all_day and customer_id is not null
        and (select count(*) from workforce_work_queue_claims claim where claim.queue_item_id = work.id) = 1`)).rows)
      .toEqual([{ count: 32 }]);
    expect((await db.query(`select count(*)::int as count from workforce_work_queue_items
      where id::text !~ '^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$'`)).rows)
      .toEqual([{ count: 0 }]);
    expect((await db.query(`select count(*)::int as count from customer_orders customer_order
      where (select max(work_on) from workforce_work_queue_items where linked_task_id = customer_order.id
        and kind = 'shipment_loading') = (select min(work_on) from sample_work_days
          where work_on > (select max(cycle.packaging_on) from sample_work_cycles cycle
          where cycle.order_id = customer_order.id))`)).rows).toEqual([{ count: 2 }]);
    expect((await db.query('select count(distinct work_on)::int as count from workforce_work_queue_items')).rows)
      .toEqual([{ count: 8 }]);
    expect((await db.query(`select count(*)::int as count from workforce_work_queue_items
      where extract(isodow from work_on) in (6, 7)`)).rows).toEqual([{ count: 0 }]);
    expect((await db.query(`select count(*)::int as count from sample_work_days day
      where day.workday_number <= 8
        and not exists (select 1 from workforce_work_queue_items work where work.work_on = day.work_on)`)).rows)
      .toEqual([{ count: 0 }]);
    expect((await db.query(`select count(*)::int as count from sample_dates dates
      where dates.production_start = (select min(prep_on) from sample_work_cycles)
        and dates.ranch_finish = (select max(packaging_on) from sample_work_cycles)
        and dates.italian_finish = dates.ranch_finish
        and dates.ranch_pickup = (select max(work_on) from workforce_work_queue_items)
        and dates.italian_pickup = dates.ranch_pickup`)).rows).toEqual([{ count: 1 }]);
  } finally {
    await db.close();
  }
});
