import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const organizationId = id(10);
const facilityId = id(11);
const first = id(701);
const middle = id(702);
const last = id(703);
const otherFacilityWork = id(704);
const legacyFirst = id(710);
const legacyMiddle = id(711);
const legacyLast = id(712);
let database: PGlite;

async function query(sql: string, parameters: unknown[] = []) {
  return database.query(sql, parameters);
}

async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
}

function dependencyPayload(successorId: string, revision: number, predecessorIds: string[]) {
  return JSON.stringify({
    facility_id: facilityId,
    successor_id: successorId,
    revision,
    predecessor_ids: predecessorIds,
  });
}

describe('durable work-order dependencies', () => {
  beforeAll(async () => {
    database = new PGlite();
    await initializeGateDatabase((sql) => database.exec(sql));
    await database.exec('reset role');
    await query(`insert into public.facilities(id,organization_id,name)
      values($1,$2,'Other dependency facility')`, [id(12), organizationId]);
    await query(`insert into public.workforce_work_queue_items(
      id,organization_id,facility_id,work_on,kind,title,created_by,updated_by
    ) values
      ($1,$4,$5,current_date,'cleaning','First',$6,$6),
      ($2,$4,$5,current_date,'cleaning','Middle',$6,$6),
      ($3,$4,$5,current_date,'cleaning','Last',$6,$6),
      ($7,$4,$8,current_date,'cleaning','Other facility',$6,$6)`, [
      first, middle, last, organizationId, facilityId, gateActor, otherFacilityWork, id(12),
    ]);
    await query(`insert into public.workforce_schedule_events(
      id,organization_id,facility_id,start_on,end_on,start_at,end_at,all_day,timezone,
      kind,title,created_by,updated_by
    ) values
      ($1,$4,$5,'2026-10-05','2026-10-06','2026-10-05T08:00:00-05:00','2026-10-05T09:00:00-05:00',false,'America/Chicago','cleaning','Legacy first',$6,$6),
      ($2,$4,$5,'2026-10-05','2026-10-06','2026-10-05T09:00:00-05:00','2026-10-05T10:00:00-05:00',false,'America/Chicago','cleaning','Legacy middle',$6,$6),
      ($3,$4,$5,'2026-10-05','2026-10-06','2026-10-05T10:00:00-05:00','2026-10-05T11:00:00-05:00',false,'America/Chicago','cleaning','Legacy last',$6,$6)`, [
      legacyFirst, legacyMiddle, legacyLast, organizationId, facilityId, gateActor,
    ]);
    await actAs(gateActor);
  }, 60000);

  afterAll(async () => {
    await database.close();
  });

  it('moves only the canonical root and unfinished downstream chain in one transaction', async () => {
    await query('select public.set_work_order_predecessors($1::jsonb)', [
      dependencyPayload(middle, 1, [first]),
    ]);
    await query('select public.set_work_order_predecessors($1::jsonb)', [
      dependencyPayload(last, 1, [middle]),
    ]);
    await database.exec('reset role');
    await query(`update public.workforce_work_queue_items set
      start_at='2026-10-05T08:00:00-05:00',end_at='2026-10-05T09:00:00-05:00',
      timezone='America/Chicago',all_day=false,work_on='2026-10-05' where id=$1`, [first]);
    await query(`update public.workforce_work_queue_items set
      start_at='2026-10-05T09:00:00-05:00',end_at='2026-10-05T10:00:00-05:00',
      timezone='America/Chicago',all_day=false,work_on='2026-10-05' where id=$1`, [middle]);
    await query(`update public.workforce_work_queue_items set
      start_at='2026-10-05T10:00:00-05:00',end_at='2026-10-05T11:00:00-05:00',
      timezone='America/Chicago',all_day=false,work_on='2026-10-05' where id=$1`, [last]);
    await actAs(gateActor);
    await query('select public.move_scheduled_work_order($1::jsonb)', [JSON.stringify({
      id: first,
      revision: 1,
      start_at: '2026-10-06T08:00:00-05:00',
      end_at: '2026-10-06T09:30:00-05:00',
    })]);
    await database.exec('reset role');
    expect((await query(`select id,start_at,end_at,revision from public.workforce_work_queue_items
      where id in ($1,$2,$3) order by id`, [first, middle, last])).rows).toEqual([
      {
        id: first, start_at: new Date('2026-10-06T13:00:00.000Z'), end_at: new Date('2026-10-06T14:30:00.000Z'), revision: 2,
      },
      {
        id: middle, start_at: new Date('2026-10-06T14:00:00.000Z'), end_at: new Date('2026-10-06T15:00:00.000Z'), revision: 3,
      },
      {
        id: last, start_at: new Date('2026-10-06T15:00:00.000Z'), end_at: new Date('2026-10-06T16:00:00.000Z'), revision: 3,
      },
    ]);
    await actAs(gateActor);
  });

  it('persists scoped edges, rejects cycles, and uses optimistic revisions', async () => {
    expect((await query('select public.get_work_order_dependencies($1::jsonb) dependencies', [
      JSON.stringify({ facility_id: facilityId }),
    ])).rows).toEqual([{
      dependencies: [
        { predecessor_id: first, successor_id: middle },
        { predecessor_id: middle, successor_id: last },
      ],
    }]);
    await expect(query('select public.set_work_order_predecessors($1::jsonb)', [
      dependencyPayload(first, 2, [last]),
    ])).rejects.toThrow('cannot contain a cycle');
    await expect(query('select public.set_work_order_predecessors($1::jsonb)', [
      dependencyPayload(middle, 1, []),
    ])).rejects.toThrow('changed; reload');
    await expect(query('select public.set_work_order_predecessors($1::jsonb)', [
      dependencyPayload(middle, 3, [otherFacilityWork]),
    ])).rejects.toThrow('predecessor unavailable');
  });

  it('deletes a middle order by atomically reattaching its successor', async () => {
    await query('select public.delete_work_order($1::jsonb)', [JSON.stringify({
      facility_id: facilityId, id: middle, revision: 3,
    })]);

    await database.exec('reset role');
    expect((await query(`select predecessor_id,successor_id
      from public.work_order_dependencies order by predecessor_id,successor_id`)).rows)
      .toEqual([{ predecessor_id: first, successor_id: last }]);
    expect((await query(`select id,status,publication_state,revision
      from public.workforce_work_queue_items where id in ($1,$2) order by id`, [middle, last])).rows)
      .toEqual([
        {
          id: middle, status: 'cancelled', publication_state: 'cancelled', revision: 4,
        },
        {
          id: last, status: 'available', publication_state: 'draft', revision: 4,
        },
      ]);
    expect((await query(`select event_type from public.audit_events
      where entity_id=$1 order by occurred_at`, [middle])).rows)
      .toEqual([{ event_type: 'WORK_ORDER_PREDECESSORS_CHANGED' }, { event_type: 'WORK_ORDER_DELETED' }]);
    await actAs(gateActor);
  });

  it('leaves a successor initial when deleting an order with no predecessor', async () => {
    await query('select public.delete_work_order($1::jsonb)', [JSON.stringify({
      facility_id: facilityId, id: first, revision: 2,
    })]);
    await database.exec('reset role');
    expect((await query('select * from public.work_order_dependencies')).rows).toEqual([]);
    expect((await query('select revision from public.workforce_work_queue_items where id=$1', [last])).rows)
      .toEqual([{ revision: 5 }]);
    await actAs(gateActor);
  });

  it('moves and deletion-relinks the compatibility schedule-event chain', async () => {
    await query('select public.set_schedule_event_predecessors($1::jsonb)', [
      dependencyPayload(legacyMiddle, 1, [legacyFirst]),
    ]);
    await query('select public.set_schedule_event_predecessors($1::jsonb)', [
      dependencyPayload(legacyLast, 1, [legacyMiddle]),
    ]);
    await query('select public.move_schedule_event_with_successors($1::jsonb)', [JSON.stringify({
      id: legacyFirst,
      revision: 1,
      start_at: '2026-10-07T08:00:00-05:00',
      end_at: '2026-10-07T09:00:00-05:00',
    })]);
    await query('select public.delete_workforce_schedule_event($1::jsonb)', [JSON.stringify({
      id: legacyMiddle, facility_id: facilityId, revision: 3,
    })]);
    await database.exec('reset role');
    expect((await query(`select predecessor_id,successor_id
      from public.workforce_schedule_event_dependencies`)).rows)
      .toEqual([{ predecessor_id: legacyFirst, successor_id: legacyLast }]);
    expect((await query(`select id,start_at,revision from public.workforce_schedule_events
      where id in ($1,$2) order by id`, [legacyFirst, legacyLast])).rows).toEqual([
      { id: legacyFirst, start_at: new Date('2026-10-07T13:00:00.000Z'), revision: 2 },
      { id: legacyLast, start_at: new Date('2026-10-07T15:00:00.000Z'), revision: 4 },
    ]);
    await actAs(gateActor);
    await query('select public.delete_workforce_schedule_event($1::jsonb)', [JSON.stringify({
      id: legacyFirst, facility_id: facilityId, revision: 2,
    })]);
    await database.exec('reset role');
    expect((await query('select * from public.workforce_schedule_event_dependencies')).rows).toEqual([]);
    await actAs(gateActor);
  });

  it('protects completed successors from deletion-driven dependency rewrites', async () => {
    const predecessor = id(705);
    const completedSuccessor = id(706);
    await database.exec('reset role');
    await query(`insert into public.workforce_work_queue_items(
      id,organization_id,facility_id,work_on,kind,title,status,completed_by,completed_at,
      created_by,updated_by
    ) values
      ($1,$3,$4,current_date,'cleaning','Predecessor','available',null,null,$5,$5),
      ($2,$3,$4,current_date,'cleaning','Completed successor','completed',$5,now(),$5,$5)`, [
      predecessor, completedSuccessor, organizationId, facilityId, gateActor,
    ]);
    await query(`insert into public.work_order_dependencies(
      organization_id,facility_id,predecessor_id,successor_id,created_by
    ) values($1,$2,$3,$4,$5)`, [
      organizationId, facilityId, predecessor, completedSuccessor, gateActor,
    ]);
    await actAs(gateActor);
    await expect(query('select public.delete_work_order($1::jsonb)', [JSON.stringify({
      facility_id: facilityId, id: predecessor, revision: 1,
    })])).rejects.toThrow('Completed work dependencies cannot be changed');
  });
});
