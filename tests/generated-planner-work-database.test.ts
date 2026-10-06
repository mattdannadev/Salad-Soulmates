import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const org = '00000000-0000-4000-8000-000000000010';
const facility = '00000000-0000-4000-8000-000000000011';
const id = (n: number) => `00000000-0000-4000-8000-${String(n).padStart(12, '0')}`;
let db: PGlite;
async function actor() {
  await db.exec('reset role');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
  await db.exec('set role authenticated');
}

describe('generated planner Work synchronization', () => {
  beforeAll(async () => {
    db = new PGlite();
    await initializeGateDatabase((sql) => db.exec(sql));
    await db.exec('reset role');
    await Promise.all([801, 802, 803, 804, 805].map(async (n) => {
      await db.query(`insert into public.workforce_work_queue_items(
        id,organization_id,facility_id,work_on,kind,title,start_at,end_at,timezone,created_by,updated_by)
        values($1,$2,$3,'2026-10-05','cleaning','Generated test','2026-10-05T13:00:00Z',
          '2026-10-05T14:00:00Z','America/Chicago',$4,$4)`, [id(n), org, facility, gateActor]);
      await db.query(`insert into public.workforce_schedule_events(
        id,organization_id,facility_id,start_on,end_on,kind,title,start_at,end_at,all_day,timezone,created_by,updated_by)
        values($1,$2,$3,'2026-10-05','2026-10-06','cleaning','Generated test','2026-10-05T13:00:00Z',
          '2026-10-05T14:00:00Z',false,'America/Chicago',$4,$4)`, [id(n), org, facility, gateActor]);
    }));
    await Promise.all(['work_order_dependencies', 'workforce_schedule_event_dependencies'].map(async (table) => {
      await db.query(`insert into public.${table}(organization_id,facility_id,predecessor_id,successor_id,created_by)
        values($1,$2,$3,$4,$5),($1,$2,$4,$6,$5)`, [org, facility, id(801), id(802), gateActor, id(803)]);
    }));
    await actor();
  }, 60000);
  afterAll(async () => db.close());

  it('moves canonical root and successors together with their planner projections', async () => {
    await db.query('select public.move_schedule_event_with_successors($1::jsonb)', [JSON.stringify({
      id: id(801), revision: 1, start_at: '2026-10-06T13:00:00Z', end_at: '2026-10-06T14:00:00Z',
    })]);
    await db.exec('reset role');
    const result = await db.query(
      `select w.id,w.work_on,w.start_at=e.start_at synced,
      w.end_at=e.end_at end_synced from public.workforce_work_queue_items w
      join public.workforce_schedule_events e on e.id=w.id where w.id in ($1,$2,$3) order by w.id`,
      [id(801), id(802), id(803)],
    );
    expect(result.rows).toEqual([801, 802, 803].map((n) => ({
      id: id(n), work_on: new Date('2026-10-06T00:00:00Z'), synced: true, end_synced: true,
    })));
    await actor();
  });

  it('deletes projection, cancels canonical Work, and reconnects both dependency graphs', async () => {
    await db.query('select public.delete_workforce_schedule_event($1::jsonb)', [JSON.stringify({
      id: id(802), facility_id: facility, revision: 2,
    })]);
    await db.exec('reset role');
    expect((await db.query(
      'select status,publication_state from public.workforce_work_queue_items where id=$1',
      [id(802)],
    )).rows).toEqual([{ status: 'cancelled', publication_state: 'cancelled' }]);
    expect((await db.query('select id from public.workforce_schedule_events where id=$1', [id(802)])).rows).toEqual([]);
    await Promise.all(['work_order_dependencies', 'workforce_schedule_event_dependencies'].map(async (table) => {
      expect((await db.query(`select predecessor_id,successor_id from public.${table}
        where predecessor_id=$1`, [id(801)])).rows).toEqual([{ predecessor_id: id(801), successor_id: id(803) }]);
    }));
    await actor();
  });

  it('rolls back canonical cancellation when planner optimistic revision is stale', async () => {
    await expect(db.query('select public.delete_workforce_schedule_event($1::jsonb)', [JSON.stringify({
      id: id(804), facility_id: facility, revision: 9,
    })])).rejects.toThrow('Schedule changed');
    await db.exec('reset role');
    expect((await db.query('select status from public.workforce_work_queue_items where id=$1', [id(804)])).rows)
      .toEqual([{ status: 'available' }]);
    await actor();
  });

  it('synchronizes an ordinary planner date edit into matching canonical Work', async () => {
    await db.query('select public.save_workforce_schedule_event($1::jsonb)', [JSON.stringify({
      id: id(805),
      facility_id: facility,
      revision: 1,
      kind: 'cleaning',
      title: 'Moved generated work',
      start_at: '2026-10-07T13:00:00Z',
      end_at: '2026-10-07T14:00:00Z',
      all_day: false,
      required_worker_count: 1,
      employee_ids: [],
    })]);
    await db.exec('reset role');
    expect((await db.query(`select w.title,w.start_at=e.start_at synced from public.workforce_work_queue_items w
      join public.workforce_schedule_events e on w.id=e.id where w.id=$1`, [id(805)])).rows)
      .toEqual([{ title: 'Moved generated work', synced: true }]);
    await actor();
  });

  it('rejects completed canonical root moves and leaves both times unchanged', async () => {
    await db.exec('reset role');
    await db.query("update public.workforce_work_queue_items set status='completed',completed_at=now(),completed_by=$2 where id=$1", [id(804), gateActor]);
    await actor();
    await expect(db.query('select public.move_schedule_event_with_successors($1::jsonb)', [JSON.stringify({
      id: id(804), revision: 1, start_at: '2026-10-08T13:00:00Z', end_at: '2026-10-08T14:00:00Z',
    })])).rejects.toThrow('Completed work cannot be moved');
    await db.exec('reset role');
    expect((await db.query('select start_on from public.workforce_schedule_events where id=$1', [id(804)])).rows)
      .toEqual([{ start_on: new Date('2026-10-05T00:00:00Z') }]);
    await actor();
  });
});
