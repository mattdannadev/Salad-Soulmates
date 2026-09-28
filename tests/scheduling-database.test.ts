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
let database: PGlite;

async function asUser(userId: string, sql: string, parameters: unknown[] = []) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await database.exec('set role authenticated');
  return database.query(sql, parameters);
}

beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
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
      }).passthrough()),
    }),
  }).parse(published.rows[0]).schedule.events)
    .toEqual([expect.objectContaining({
      id: publicationEventId,
      start_on: '2026-10-05',
      product_name: 'Schedule fixture product',
      customer_name: 'Schedule fixture customer',
      location_label: 'Mixer room',
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
    title: 'Mixing',
    production_plan_id: planId,
    employee_ids: [gateActor],
  };
  const saved = await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb) as id', [JSON.stringify(payload)]);
  expect(saved.rows).toEqual([{ id: eventId }]);
  await asUser(gateActor, 'select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
    ...payload, id: otherEventId, start_on: '2026-09-30', end_on: '2026-10-01', title: 'Other event',
  })]);
  const loaded = await asUser(gateActor, 'select public.get_workforce_schedule($1::jsonb) as schedule', [JSON.stringify({
    facility_id: facilityId, start_on: '2026-09-28', end_on: '2026-10-01',
  })]);
  const schedule = z.object({
    schedule: z.object({
      events: z.array(z.object({
        id: z.uuid(), employee_ids: z.array(z.uuid()), production_plan_id: z.uuid().nullable(),
      }).passthrough()),
    }),
  }).parse(loaded.rows[0]);
  expect(schedule.schedule.events).toEqual(expect.arrayContaining([
    expect.objectContaining({
      id: eventId, employee_ids: [gateActor], production_plan_id: planId,
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
    employee_ids: [gateActor],
  })])).rejects.toThrow('Workforce management permission required');
});
