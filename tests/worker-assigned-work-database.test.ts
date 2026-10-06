import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { assignedWorkerWorkSchema } from '@/domain/work-queue';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const organizationId = '00000000-0000-4000-8000-000000000010';
const facilityId = '00000000-0000-4000-8000-000000000011';
const coworkerId = '00000000-0000-4000-8000-000000000201';
const outsiderId = '00000000-0000-4000-8000-000000000202';
const assignedWorkId = '00000000-0000-4000-8000-000000000203';
const unassignedWorkId = '00000000-0000-4000-8000-000000000204';
const productId = '00000000-0000-4000-8000-000000000205';
const customerId = '00000000-0000-4000-8000-000000000206';
const orderId = '00000000-0000-4000-8000-000000000207';
let database: PGlite;

async function asUser(userId: string, sql: string, parameters: unknown[] = []) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [userId]);
  await database.exec('set role authenticated');
  return database.query(sql, parameters);
}

describe('worker assigned work projection', () => {
  beforeAll(async () => {
    database = new PGlite();
    await initializeGateDatabase((sql) => database.exec(sql));
    await database.exec('reset role');
    await database.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
    await database.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
      coworkerId, 'coworker@example.test', outsiderId, 'outsider@example.test',
    ]);
    await database.query(`insert into public.profiles(
      id,organization_id,facility_id,display_name,role,first_name,last_name,access_profile_id
    ) values
      ($1,$2,$3,'Coworker Name','worker','Coworker','Name',
        (select id from public.access_profiles where organization_id=$2 and base_role='worker' limit 1)),
      ($4,$2,$3,'Outside Worker','worker','Outside','Worker',
        (select id from public.access_profiles where organization_id=$2 and base_role='worker' limit 1))`, [
      coworkerId, organizationId, facilityId, outsiderId,
    ]);
    await database.query('insert into public.products(id,organization_id,name) values($1,$2,$3)', [
      productId, organizationId, 'Ranch',
    ]);
    await database.query(
      'insert into public.customers(id,organization_id,name) values($1,$2,$3)',
      [customerId, organizationId, 'Local Grocer'],
    );
    await database.exec(`alter table public.material_plans disable trigger material_plan_guard;
      alter table public.customer_orders disable trigger customer_order_guard`);
    await database.query(`insert into public.material_plans(
      id,organization_id,facility_id,name,needed_on,batches,created_by
    ) values($1,$2,$3,'Worker order','2026-10-08','[]'::jsonb,$4)`, [
      orderId, organizationId, facilityId, gateActor,
    ]);
    await database.query(`insert into public.customer_orders(
      id,organization_id,facility_id,customer_id,customer_name,reference,needed_on,products,created_by
    ) values($1,$2,$3,$4,'Local Grocer','SO-100','2026-10-08','[]'::jsonb,$5)`, [
      orderId, organizationId, facilityId, customerId, gateActor,
    ]);
    await database.exec(`alter table public.material_plans enable trigger material_plan_guard;
      alter table public.customer_orders enable trigger customer_order_guard`);
    await database.query(`insert into public.workforce_work_queue_items(
      id,organization_id,facility_id,work_on,kind,title,batch_quota,estimated_minutes,
      linked_task_type,linked_task_id,required_worker_count,status,publication_state,
      published_by,published_at,created_by,updated_by,start_at,end_at,timezone,product_id,
      customer_id,location_label
    ) values
      ($1,$2,$3,'2026-10-06','mixing','Ranch mixing',1,120,'production_plan',$4,2,
        'claimed','published',$5,now(),$5,$5,'2026-10-06 08:00-05','2026-10-06 10:00-05',
        'America/Chicago',$6,$7,'Mixer room'),
      ($8,$2,$3,'2026-10-07','other','Not mine',null,null,null,null,1,
        'claimed','published',$5,now(),$5,$5,null,null,null,null,null,null)`, [
      assignedWorkId, organizationId, facilityId, orderId, gateActor, productId, customerId,
      unassignedWorkId,
    ]);
    await database.query(`insert into public.workforce_work_queue_claims(
      organization_id,facility_id,queue_item_id,worker_id,claim_source
    ) values($1,$2,$3,$4,'supervisor_assigned'),($1,$2,$3,$5,'supervisor_assigned'),
      ($1,$2,$6,$7,'supervisor_assigned')`, [
      organizationId, facilityId, assignedWorkId, gateActor, coworkerId,
      unassignedWorkId, outsiderId,
    ]);
  });

  afterAll(async () => database.close());

  it('returns only the caller claims with safe work context and coworker names', async () => {
    const result = await asUser(
      gateActor,
      'select public.get_my_worker_work($1::jsonb) as work',
      [JSON.stringify({ start_on: '2026-10-01', end_on: '2026-11-01' })],
    );
    const projection = assignedWorkerWorkSchema.parse(
      z.object({ work: z.unknown() }).parse(result.rows[0]).work,
    );

    expect(projection.facility.timezone).toBe('America/Chicago');
    expect(projection.items).toHaveLength(1);
    expect(projection.items[0]).toMatchObject({
      id: assignedWorkId,
      location_label: 'Mixer room',
      customer: { name: 'Local Grocer' },
      order: { reference: 'SO-100' },
      product: { name: 'Ranch' },
      coworkers: ['Coworker Name'],
      assignment: { source: 'supervisor_assigned' },
    });
  });

  it('rejects inactive callers even when their old claim remains', async () => {
    await database.exec('reset role');
    await database.query('update public.profiles set active=false where id=$1', [gateActor]);
    await expect(asUser(
      gateActor,
      'select public.get_my_worker_work($1::jsonb)',
      [JSON.stringify({ start_on: '2026-10-01', end_on: '2026-11-01' })],
    )).rejects.toThrow('Active worker profile required');
  });
});
