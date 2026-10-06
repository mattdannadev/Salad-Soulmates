import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  afterAll, beforeAll, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const organizationId = '00000000-0000-4000-8000-000000000010';
const facilityId = '00000000-0000-4000-8000-000000000011';
const eventId = '00000000-0000-4000-8000-000000000099';
const otherEventId = '00000000-0000-4000-8000-000000000100';
const planId = '00000000-0000-4000-8000-000000000098';
const customerId = '00000000-0000-4000-8000-000000000097';
const productId = '00000000-0000-4000-8000-000000000096';
const workerId = '00000000-0000-4000-8000-000000000101';
const publicationEventId = '00000000-0000-4000-8000-000000000102';
const uncoveredEventId = '00000000-0000-4000-8000-000000000103';
const ptoId = '00000000-0000-4000-8000-000000000104';
const weekendEventId = '00000000-0000-4000-8000-000000000105';
const dailyWorkEventId = '00000000-0000-4000-8000-000000000106';
let database: PGlite;
let ptoTypeId: string;

async function asUser(userId: string, sql: string, parameters: unknown[] = []) {
  const rpcParameters = [...parameters];
  if (sql.includes('save_workforce_schedule_event') && typeof rpcParameters[0] === 'string') {
    const payload = z.record(z.string(), z.unknown()).parse(JSON.parse(rpcParameters[0]));
    if (!payload.start_at) {
      payload.start_at = `${String(payload.start_on)}T00:00:00-05:00`;
      payload.end_at = `${String(payload.end_on)}T00:00:00-05:00`;
      payload.all_day = true;
    }
    rpcParameters[0] = JSON.stringify(payload);
  }
  if (sql.includes('save_workforce_pto') && typeof rpcParameters[0] === 'string') {
    rpcParameters[0] = JSON.stringify({ pto_type_id: ptoTypeId, ...JSON.parse(rpcParameters[0]) });
  }
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await database.exec('set role authenticated');
  return database.query(sql, rpcParameters);
}

beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  const types = await database.query<{ id: string }>(
    'select id from public.workforce_pto_types where organization_id=$1 and active limit 1',
    [organizationId],
  );
  ptoTypeId = z.object({ id: z.uuid() }).parse(types.rows[0]).id;
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
  // Parent order rows are fixture scaffolding; this suite exercises scheduling rules.
  await database.exec(`alter table public.material_plans disable trigger material_plan_guard;
    alter table public.customer_orders disable trigger customer_order_guard`);
  await database.query('insert into public.customers(id,organization_id,name) values($1,$2,$3)', [
    customerId, organizationId, 'Schedule fixture customer',
  ]);
  await database.query('insert into public.products(id,organization_id,name) values($1,$2,$3)', [
    productId, organizationId, 'Schedule fixture product',
  ]);
  await database.query(`insert into public.material_plans(
    id,organization_id,facility_id,name,needed_on,batches,created_by
  ) values($1,$2,$3,'Schedule fixture','2026-10-01','[]'::jsonb,$4)`, [
    planId, organizationId, facilityId, gateActor,
  ]);
  await database.query(`insert into public.customer_orders(
    id,organization_id,facility_id,customer_id,customer_name,needed_on,products,created_by
  ) values($1,$2,$3,$4,'Schedule fixture customer','2026-10-01','[]'::jsonb,$5)`, [
    planId, organizationId, facilityId, customerId, gateActor,
  ]);
  await database.query(`insert into public.order_production_plans(
    id,organization_id,facility_id,start_on,finish_on,created_by
  ) values($1,$2,$3,'2026-09-28','2026-09-30',$4)`, [
    planId, organizationId, facilityId, gateActor,
  ]);
  await database.exec(`alter table public.material_plans enable trigger material_plan_guard;
    alter table public.customer_orders enable trigger customer_order_guard`);
  await database.query('insert into auth.users(id,email) values($1,$2)', [workerId, 'worker@example.test']);
  await database.query(
    `insert into public.profiles(id,organization_id,facility_id,display_name,
    role,first_name,last_name,access_profile_id)
    values($1,$2,$3,'Other worker','worker','Other','worker',
      (select id from public.access_profiles where organization_id=$2 and base_role='worker' limit 1))`,
    [workerId, organizationId, facilityId],
  );
});

it('keeps drafts private until publish and scopes each worker to their own assignments', async () => {
  const payload = {
    id: publicationEventId,
    facility_id: facilityId,
    revision: 0,
    start_on: '2026-10-05',
    end_on: '2026-10-06',
    kind: 'mixing',
    required_worker_count: 2,
    title: 'Monday mixing',
    employee_ids: [gateActor],
    product_id: productId,
    customer_id: customerId,
    location_label: 'Mixer room',
  };
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify(payload)]);
  const range = JSON.stringify({ start_on: '2026-10-05', end_on: '2026-10-10' });
  expect((await asUser(
    gateActor,
    'select public.get_my_workforce_schedule($1::jsonb) as schedule',
    [range],
  )).rows[0])
    .toEqual({ schedule: { timezone: 'America/Chicago', events: [], pto: [] } });
  await asUser(gateActor, 'select public.publish_workforce_schedule($1::jsonb)', [
    JSON.stringify({ facility_id: facilityId, revision: 0 }),
  ]);
  const published = await asUser(
    gateActor,
    'select public.get_my_workforce_schedule($1::jsonb) as schedule',
    [range],
  );
  expect(z.object({
    schedule: z.object({
      events: z.array(z.object({
        id: z.uuid(),
        start_on: z.iso.date(),
        product_name: z.string(),
        customer_name: z.string(),
        location_label: z.string(),
        required_worker_count: z.number().int().positive(),
      }).passthrough()),
    }),
  }).parse(published.rows[0]).schedule.events)
    .toEqual([expect.objectContaining({
      id: publicationEventId,
      start_on: '2026-10-05',
      product_name: 'Schedule fixture product',
      customer_name: 'Schedule fixture customer',
      location_label: 'Mixer room',
      required_worker_count: 2,
    })]);
  const otherWorker = await asUser(
    workerId,
    'select public.get_my_workforce_schedule($1::jsonb) as schedule',
    [range],
  );
  expect(otherWorker.rows[0]).toEqual({
    schedule: { timezone: 'America/Chicago', events: [], pto: [] },
  });
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [
    JSON.stringify({
      ...payload,
      revision: 1,
      start_on: '2026-10-06',
      end_on: '2026-10-07',
      title: 'Tuesday mixing',
    }),
  ]);
  const beforeRepublish = await asUser(
    gateActor,
    'select public.get_my_workforce_schedule($1::jsonb) as schedule',
    [range],
  );
  expect(z.object({ schedule: z.object({ events: z.array(z.object({ start_on: z.iso.date() })) }) })
    .parse(beforeRepublish.rows[0]).schedule.events[0]?.start_on).toBe('2026-10-05');
  await asUser(gateActor, 'select public.publish_workforce_schedule($1::jsonb)', [
    JSON.stringify({ facility_id: facilityId, revision: 1 }),
  ]);
  const afterRepublish = await asUser(
    gateActor,
    'select public.get_my_workforce_schedule($1::jsonb) as schedule',
    [range],
  );
  expect(z.object({ schedule: z.object({ events: z.array(z.object({ start_on: z.iso.date() })) }) })
    .parse(afterRepublish.rows[0]).schedule.events[0]?.start_on).toBe('2026-10-06');
});

it('blocks PTO and assignment conflicts and permits visibly unassigned draft work', async () => {
  await expect(asUser(gateActor, 'select public.save_workforce_pto($1::jsonb)', [JSON.stringify({
    id: ptoId,
    facility_id: facilityId,
    employee_id: gateActor,
    revision: 0,
    start_on: '2026-10-06',
    end_on: '2026-10-07',
    start_minute: 480,
    end_minute: 1020,
    private_note: 'Private reason',
  })])).rejects.toThrow('PTO conflicts with scheduled work');
  await asUser(gateActor, 'select public.save_workforce_pto($1::jsonb)', [JSON.stringify({
    id: ptoId,
    facility_id: facilityId,
    employee_id: gateActor,
    revision: 0,
    start_on: '2026-10-07',
    end_on: '2026-10-08',
    start_minute: 480,
    end_minute: 1020,
    private_note: 'Private reason',
  })]);
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [
    JSON.stringify({
      id: uncoveredEventId,
      facility_id: facilityId,
      revision: 0,
      start_on: '2026-10-07',
      end_on: '2026-10-08',
      kind: 'cleaning',
      required_worker_count: 1,
      employee_ids: [gateActor],
    }),
  ])).rejects.toThrow('Approved PTO conflicts');
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [
    JSON.stringify({
      id: uncoveredEventId,
      facility_id: facilityId,
      revision: 0,
      start_on: '2026-10-07',
      end_on: '2026-10-08',
      kind: 'cleaning',
      required_worker_count: 1,
      employee_ids: [],
    }),
  ]);
  const schedule = await asUser(
    gateActor,
    'select public.get_workforce_schedule($1::jsonb) as schedule',
    [JSON.stringify({
      facility_id: facilityId, start_on: '2026-10-07', end_on: '2026-10-08',
    })],
  );
  const parsed = z.object({
    schedule: z.object({
      events: z.array(z.object({ id: z.uuid(), employee_ids: z.array(z.uuid()) }).passthrough()),
    }),
  }).parse(schedule.rows[0]);
  expect(parsed.schedule.events).toEqual(expect.arrayContaining([
    expect.objectContaining({ id: uncoveredEventId, employee_ids: [] }),
  ]));
  const worker = await asUser(
    gateActor,
    'select public.get_my_workforce_schedule($1::jsonb) as schedule',
    [JSON.stringify({
      start_on: '2026-10-07', end_on: '2026-10-08',
    })],
  );
  expect(z.object({ schedule: z.object({ pto: z.array(z.object({ start_on: z.iso.date() })) }) })
    .parse(worker.rows[0]).schedule.pto[0]?.start_on).toBe('2026-10-07');
  expect(JSON.stringify(worker.rows[0])).not.toContain('Private reason');
});

it('requires an availability override and rejects stale publication', async () => {
  const payload = {
    id: weekendEventId,
    facility_id: facilityId,
    revision: 0,
    start_on: '2026-10-10',
    end_on: '2026-10-11',
    kind: 'cleaning',
    required_worker_count: 1,
    employee_ids: [gateActor],
  };
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [
    JSON.stringify(payload),
  ])).rejects.toThrow('Availability override reason required');
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [
    JSON.stringify({ ...payload, availability_override_reason: 'Weekend cleanup' }),
  ]);
  await expect(asUser(gateActor, 'select public.publish_workforce_schedule($1::jsonb)', [
    JSON.stringify({ facility_id: facilityId, revision: 1 }),
  ])).rejects.toThrow('Schedule changed; reload and try again');
});

afterAll(async () => {
  await database?.close();
});

it('creates, updates, and deletes a linked assignment with complete history', async () => {
  const payload = {
    id: eventId,
    facility_id: facilityId,
    revision: 0,
    start_on: '2026-09-28',
    end_on: '2026-09-30',
    kind: 'mixing',
    required_worker_count: 2,
    title: 'Mixing',
    production_plan_id: planId,
    employee_ids: [gateActor],
  };
  const { required_worker_count: omittedRequiredCount, ...withoutRequiredCount } = payload;
  expect(omittedRequiredCount).toBe(2);
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [
    JSON.stringify(withoutRequiredCount),
  ])).rejects.toThrow('Invalid schedule event');
  const saved = await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb) as id', [JSON.stringify(payload)]);
  expect(saved.rows).toEqual([{ id: eventId }]);
  const orderContext = await asUser(
    gateActor,
    'select public.get_schedule_customer_orders($1::jsonb) as customer_orders',
    [JSON.stringify({
      facility_id: facilityId, start_on: '2026-09-28', end_on: '2026-09-30',
    })],
  );
  expect(orderContext.rows).toEqual([{
    customer_orders: [expect.objectContaining({ id: planId, needed_on: '2026-10-01' })],
  }]);
  const createdOrder = await database.query<{ created_on: string }>(
    'select created_at::date::text as created_on from public.customer_orders where id = $1',
    [planId],
  );
  expect(orderContext.rows).toEqual([{
    customer_orders: [expect.objectContaining({ created_on: createdOrder.rows[0]?.created_on })],
  }]);
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...payload, id: otherEventId, start_on: '2026-09-30', end_on: '2026-10-01', title: 'Other event',
  })]);
  const loaded = await asUser(gateActor, 'select public.get_workforce_schedule($1::jsonb) as schedule', [JSON.stringify({
    facility_id: facilityId, start_on: '2026-09-28', end_on: '2026-10-01',
  })]);
  const schedule = z.object({
    schedule: z.object({
      events: z.array(z.object({
        id: z.uuid(),
        employee_ids: z.array(z.uuid()),
        production_plan_id: z.uuid().nullable(),
      }).passthrough()),
    }),
  }).parse(loaded.rows[0]);
  expect(schedule.schedule.events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: eventId,
      employee_ids: [gateActor],
      production_plan_id: planId,
      required_worker_count: 2,
    }),
  ]));
  await expect(asUser(gateActor, 'select public.delete_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    id: eventId, facility_id: facilityId, revision: 2,
  })])).rejects.toThrow('Schedule changed; reload and try again');
  const updated = await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb) as id', [
    JSON.stringify({ ...payload, revision: 1, title: 'Updated mixing' }),
  ]);
  expect(updated.rows).toEqual([{ id: eventId }]);
  const linked = await asUser(gateActor, `select production_plan_id,revision,title
    from public.workforce_schedule_events where id=$1`, [eventId]);
  expect(linked.rows).toEqual([{
    production_plan_id: planId, revision: 2, title: 'Updated mixing',
  }]);
  const otherAssignments = await asUser(gateActor, `select employee_id
    from public.workforce_schedule_assignments where event_id=$1`, [otherEventId]);
  expect(otherAssignments.rows).toEqual([{ employee_id: gateActor }]);
  const deleted = await asUser(gateActor, 'select public.delete_workforce_schedule_event($1::jsonb) as id', [
    JSON.stringify({ id: eventId, facility_id: facilityId, revision: 2 }),
  ]);
  expect(deleted.rows).toEqual([{ id: eventId }]);
  await database.exec('reset role');
  const history = await database.query(`select action,before_data,after_data
    from public.workforce_schedule_history where event_id=$1 order by occurred_at,id`, [eventId]);
  const historyRows = z.array(z.object({
    action: z.string(),
    before_data: z.object({ production_plan_id: z.uuid().nullable() }).nullable(),
    after_data: z.object({ production_plan_id: z.uuid().nullable() }).nullable(),
  })).parse(history.rows);
  expect(historyRows.map((row) => row.action).sort()).toEqual([
    'created', 'deleted', 'updated',
  ]);
  const updatedHistory = historyRows.find((row) => row.action === 'updated');
  expect(updatedHistory?.before_data?.production_plan_id).toBe(planId);
  expect(updatedHistory?.after_data?.production_plan_id).toBe(planId);
  expect((await database.query('select id from public.workforce_schedule_events where id=$1', [eventId])).rows)
    .toEqual([]);
  expect((await database.query('select id from public.workforce_schedule_events where id=$1', [otherEventId])).rows)
    .toEqual([{ id: otherEventId }]);
});

it('persists newly created all-day order work through an authoritative schedule reload', async () => {
  const payload = {
    id: dailyWorkEventId,
    facility_id: facilityId,
    revision: 0,
    start_at: '2026-10-20T05:00:00.000Z',
    end_at: '2026-10-21T05:00:00.000Z',
    all_day: true,
    start_on: '2026-10-20',
    end_on: '2026-10-21',
    kind: 'mixing',
    required_worker_count: 1,
    planned_batch_count: 7,
    completed: false,
    title: '',
    production_plan_id: null,
    linked_task_type: 'order',
    linked_task_id: planId,
    product_id: productId,
    customer_id: customerId,
    location_label: null,
    availability_override_reason: null,
    employee_ids: [],
  };
  const saved = await asUser(
    gateActor,
    'select public.save_workforce_schedule_event($1::jsonb) as id',
    [JSON.stringify(payload)],
  );
  expect(saved.rows).toEqual([{ id: dailyWorkEventId }]);

  const reloaded = await asUser(
    gateActor,
    'select public.get_workforce_schedule($1::jsonb) as schedule',
    [JSON.stringify({
      facility_id: facilityId,
      start_on: '2026-10-20',
      end_on: '2026-10-21',
    })],
  );
  const schedule = z.object({
    schedule: z.object({
      events: z.array(z.object({
        id: z.uuid(),
        start_on: z.iso.date(),
        end_on: z.iso.date(),
        all_day: z.boolean(),
        planned_batch_count: z.number().int().nullable().optional(),
        linked_task_type: z.string().nullable(),
        linked_task_id: z.uuid().nullable(),
        product_id: z.uuid().nullable(),
        customer_id: z.uuid().nullable(),
      }).passthrough()),
    }),
  }).parse(reloaded.rows[0]);
  expect(schedule.schedule.events).toContainEqual(expect.objectContaining({
    id: dailyWorkEventId,
    start_on: '2026-10-20',
    end_on: '2026-10-21',
    all_day: true,
    planned_batch_count: 7,
    linked_task_type: 'order',
    linked_task_id: planId,
    product_id: productId,
    customer_id: customerId,
  }));
});

it('allows adjacent timed work, rejects overlap, and snapshots times independently of drafts', async () => {
  const payload = {
    id: '00000000-0000-4000-8000-000000000110',
    facility_id: facilityId,
    revision: 0,
    start_at: '2026-10-12T08:00:00-05:00',
    end_at: '2026-10-12T10:00:00-05:00',
    kind: 'pre_op',
    required_worker_count: 1,
    employee_ids: [workerId],
  };
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify(payload)]);
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...payload,
    id: '00000000-0000-4000-8000-000000000111',
    start_at: '2026-10-12T10:00:00-05:00',
    end_at: '2026-10-12T11:00:00-05:00',
  })]);
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...payload,
    id: '00000000-0000-4000-8000-000000000112',
    start_at: '2026-10-12T09:59:00-05:00',
    end_at: '2026-10-12T10:30:00-05:00',
  })])).rejects.toThrow('Assignment conflicts');
  await asUser(gateActor, 'select public.publish_workforce_schedule($1::jsonb)', [
    JSON.stringify({ facility_id: facilityId, revision: 2 }),
  ]);
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...payload, revision: 1, start_at: '2026-10-12T07:00:00-05:00',
  })]);
  const published = await asUser(workerId, 'select public.get_my_workforce_schedule($1::jsonb) as schedule', [
    JSON.stringify({ start_on: '2026-10-12', end_on: '2026-10-13' }),
  ]);
  const rows = z.object({
    schedule: z.object({
      events: z.array(z.object({
        id: z.string(),
        start_at: z.string(),
        end_at: z.string(),
        all_day: z.boolean(),
        timezone: z.string(),
      })),
    }),
  }).parse(published.rows[0]).schedule.events;
  const snapshot = z.object({ start_at: z.string(), end_at: z.string() }).passthrough()
    .parse(rows.find((row) => row.id === payload.id));
  expect(snapshot).toMatchObject({
    all_day: false, timezone: 'America/Chicago',
  });
  expect(new Date(snapshot.start_at).toISOString()).toBe('2026-10-12T13:00:00.000Z');
  expect(new Date(snapshot.end_at).toISOString()).toBe('2026-10-12T15:00:00.000Z');
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...payload, revision: 2, timezone: 'Europe/London',
  })])).rejects.toThrow('Invalid facility-local schedule range');
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...payload, revision: 2, start_on: '2026-10-13',
  })])).rejects.toThrow('Invalid facility-local schedule range');
});

it('expands partial PTO by local day and excludes private notes from manager and worker reads', async () => {
  const payload = {
    id: '00000000-0000-4000-8000-000000000113',
    facility_id: facilityId,
    employee_id: workerId,
    revision: 0,
    start_on: '2026-10-13',
    end_on: '2026-10-15',
    start_minute: 540,
    end_minute: 600,
    private_note: 'Timed private note',
    pto_type_id: ptoTypeId,
  };
  await asUser(gateActor, 'select public.save_workforce_pto($1::jsonb)', [JSON.stringify(payload)]);
  const work = {
    id: '00000000-0000-4000-8000-000000000114',
    facility_id: facilityId,
    revision: 0,
    start_at: '2026-10-14T08:00:00-05:00',
    end_at: '2026-10-14T09:00:00-05:00',
    kind: 'packaging',
    required_worker_count: 1,
    employee_ids: [workerId],
  };
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify(work)]);
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...work, revision: 1, end_at: '2026-10-14T09:01:00-05:00',
  })])).rejects.toThrow('Approved PTO conflicts');
  await expect(asUser(gateActor, 'select public.save_workforce_pto($1::jsonb)', [JSON.stringify({
    ...payload, revision: 1, start_minute: 539,
  })])).rejects.toThrow('PTO conflicts with scheduled work');
  const manager = await asUser(gateActor, 'select public.get_workforce_schedule($1::jsonb)', [JSON.stringify({
    facility_id: facilityId, start_on: '2026-10-13', end_on: '2026-10-15',
  })]);
  expect(JSON.stringify(manager.rows)).not.toContain('Timed private note');
  expect(JSON.stringify(manager.rows)).toContain(ptoTypeId);
  const worker = await asUser(workerId, 'select public.get_my_workforce_schedule($1::jsonb)', [JSON.stringify({
    start_on: '2026-10-13', end_on: '2026-10-15',
  })]);
  expect(JSON.stringify(worker.rows)).not.toContain('Timed private note');
});

it('backfills draft and publication all-day times using facility midnights across DST', async () => {
  const legacy = new PGlite();
  try {
    await initializeGateDatabase(async (sql) => {
      if (sql.startsWith('-- Instants are authoritative')) {
        await legacy.exec(`
          select set_config('request.jwt.claim.sub','${gateActor}',false);
          insert into public.workforce_schedule_events(id,organization_id,facility_id,start_on,end_on,kind)
          values('${eventId}','${organizationId}','${facilityId}','2026-11-01','2026-11-02','mixing');
          insert into public.workforce_publications(organization_id,facility_id,revision,published_by)
          values('${organizationId}','${facilityId}',1,'${gateActor}');
          insert into public.workforce_published_events(organization_id,facility_id,publication_revision,
            event_id,start_on,end_on,kind,title,employee_ids)
          values('${organizationId}','${facilityId}',1,'${eventId}','2026-11-01','2026-11-02','mixing','','[]');
        `);
      }
      await legacy.exec(sql);
    });
    await legacy.exec("set timezone='UTC'");
    const result = await legacy.query(`select start_at::text,end_at::text,all_day,timezone,
      extract(epoch from end_at-start_at)/3600 as hours from public.workforce_schedule_events
      union all select start_at::text,end_at::text,all_day,timezone,
      extract(epoch from end_at-start_at)/3600 from public.workforce_published_events`);
    expect(result.rows).toEqual([0, 1].map(() => ({
      start_at: '2026-11-01 05:00:00+00',
      end_at: '2026-11-02 06:00:00+00',
      all_day: true,
      timezone: 'America/Chicago',
      hours: '25.0000000000000000',
    })));
  } finally {
    await legacy.close();
  }
});

it('rejects another facility and disabled user or access profiles', async () => {
  await expect(asUser(gateActor, 'select public.get_workforce_schedule($1::jsonb)', [JSON.stringify({
    facility_id: organizationId, start_on: '2026-09-28', end_on: '2026-10-01',
  })])).rejects.toThrow('Invalid facility scope');
  await database.exec('reset role');
  await database.query('update public.profiles set active=false where id=$1', [gateActor]);
  await expect(asUser(gateActor, 'select public.get_workforce_schedule($1::jsonb)', [JSON.stringify({
    facility_id: facilityId, start_on: '2026-09-28', end_on: '2026-10-01',
  })])).rejects.toThrow('Workforce read permission required');
  await database.exec('reset role');
  await database.query('update public.profiles set active=true where id=$1', [gateActor]);
  await database.query(`update public.access_profiles set active=false
    where id=(select access_profile_id from public.profiles where id=$1)`, [gateActor]);
  await expect(asUser(gateActor, 'select public.get_workforce_schedule($1::jsonb)', [JSON.stringify({
    facility_id: facilityId, start_on: '2026-09-28', end_on: '2026-10-01',
  })])).rejects.toThrow('Workforce read permission required');
  await expect(asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    id: eventId,
    facility_id: facilityId,
    revision: 0,
    start_on: '2026-09-28',
    end_on: '2026-09-29',
    kind: 'mixing',
    required_worker_count: 2,
    employee_ids: [gateActor],
  })])).rejects.toThrow('Workforce management permission required');
});
