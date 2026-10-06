import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { z } from 'zod';
import { workPlanVersionsSchema } from '@/domain/work-plans';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const organizationId = id(10);
const facilityId = id(11);
const planId = id(810);
const versionId = id(811);
const prepareId = id(812);
const mixId = id(813);
let database: PGlite;

async function query(sql: string, parameters: unknown[] = []) {
  return database.query(sql, parameters);
}

async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
}

describe('Work Plan master data', () => {
  beforeAll(async () => {
    database = new PGlite();
    await initializeGateDatabase((sql) => database.exec(sql));
    await database.exec('reset role');
    await query(`insert into public.work_plans(id,organization_id,facility_id,code,created_by)
      values($1,$2,$3,'standard_production',$4)`, [planId, organizationId, facilityId, gateActor]);
    await query(`insert into public.work_plan_versions(
      id,organization_id,facility_id,work_plan_id,version_number,name,created_by
    ) values($1,$2,$3,$4,1,'Standard production',$5)`, [
      versionId, organizationId, facilityId, planId, gateActor,
    ]);
    await query(`insert into public.work_plan_steps(
      id,organization_id,facility_id,work_plan_version_id,step_key,title,materialization_policy,sort_order
    ) values
      ($1,$4,$5,$3,'prepare','Prepare','work_order',10),
      ($2,$4,$5,$3,'mix','Mix','work_order',20)`, [prepareId, mixId, versionId, organizationId, facilityId]);
    await query(`insert into public.work_plan_step_dependencies(
      organization_id,facility_id,work_plan_version_id,predecessor_step_id,successor_step_id,created_by
    ) values($1,$2,$3,$4,$5,$6)`, [organizationId, facilityId, versionId, prepareId, mixId, gateActor]);
    await actAs(gateActor);
  }, 60000);

  afterAll(async () => database.close());

  it('releases an acyclic version atomically and makes it immutable', async () => {
    await query('select public.release_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: versionId, revision: 1,
    })]);
    await database.exec('reset role');
    expect((await query('select state,revision,released_by from public.work_plan_versions where id=$1', [versionId])).rows)
      .toEqual([{ state: 'released', revision: 2, released_by: gateActor }]);
    await expect(query("update public.work_plan_steps set title='Changed' where id=$1", [prepareId]))
      .rejects.toThrow('immutable');
    await actAs(gateActor);
  });

  it('rejects stale release requests', async () => {
    await expect(query('select public.release_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: versionId, revision: 1,
    })])).rejects.toThrow('changed; reload');
  });

  it('recovers clone retries without duplicating a draft or audit event', async () => {
    const payload = JSON.stringify({ work_plan_id: planId, request_id: id(900) });
    const first = z.object({ id: z.uuid() }).parse(
      (await query('select public.create_work_plan_draft_version($1::jsonb) id', [payload])).rows[0],
    );
    const retry = await query('select public.create_work_plan_draft_version($1::jsonb) id', [payload]);
    expect(retry.rows).toEqual([first]);
    await database.exec('reset role');
    expect((await query(`select count(*)::int as count from public.audit_events
      where entity_id=$1 and event_type='WORK_PLAN_VERSION_CREATED'`, [first.id])).rows)
      .toEqual([{ count: 1 }]);
    expect((await query(`select count(*)::int as count from public.work_plan_steps
      where work_plan_version_id=$1`, [first.id])).rows).toEqual([{ count: 2 }]);
    await expect(query(`update public.work_plan_steps set work_plan_version_id=$1
      where id=$2`, [first.id, prepareId])).rejects.toThrow('immutable');
    await expect(query(`insert into public.work_plan_step_dependencies(
      organization_id,facility_id,work_plan_version_id,predecessor_step_id,successor_step_id
    ) select $1,$2,$3,$4,id from public.work_plan_steps
      where work_plan_version_id=$3 and step_key='mix'`, [
      organizationId, facilityId, first.id, prepareId,
    ])).rejects.toThrow('foreign key');
    await actAs(gateActor);
  });

  it('rejects malformed templates atomically at the RPC boundary', async () => {
    const payload = {
      code: 'invalid_template',
      name: 'Invalid template',
      steps: [{
        key: 'complete',
        title: 'Complete',
        materialization_policy: 'task_only',
        task_template: { requires_verification: 'invalid' },
      }],
      dependencies: [],
    };
    await expect(query('select public.create_work_plan($1::jsonb)', [JSON.stringify(payload)]))
      .rejects.toThrow('check constraint');
    await expect(query('select public.create_work_plan($1::jsonb)', [JSON.stringify({
      ...payload,
      steps: [{ ...payload.steps[0], task_template: { instructions: 123 } }],
    })])).rejects.toThrow('check constraint');
    await expect(query('select public.create_work_plan($1::jsonb)', [JSON.stringify({
      ...payload,
      steps: [{ ...payload.steps[0], task_template: { optional: 'true' } }],
    })])).rejects.toThrow('check constraint');
    await expect(query('select public.create_work_plan($1::jsonb)', [JSON.stringify({
      ...payload,
      steps: [{ ...payload.steps[0], task_template: { optional: null } }],
    })])).rejects.toThrow('check constraint');
    await query('select public.list_work_plan_versions()');
    await database.exec('reset role');
    expect((await query("select count(*)::int as count from public.work_plans where code='invalid_template'"))
      .rows).toEqual([{ count: 0 }]);
    await actAs(gateActor);
  });

  it('preserves content through review and retirement and recovers a clone after release', async () => {
    const definition = {
      name: 'Lifecycle workflow',
      code: 'lifecycle_workflow',
      dependencies: [],
      steps: [{
        key: 'complete',
        title: 'Complete',
        materialization_policy: 'work_order',
        task_template: { instructions: 'Preserve this evidence.', requires_verification: true, optional: true },
      }],
    };
    const created = z.object({ id: z.uuid() }).parse((await query('select public.create_work_plan($1::jsonb) id', [JSON.stringify(definition)])).rows[0]);
    const transition = (revision: number, state: string) => query(
      'select public.transition_work_plan_version($1::jsonb)',
      [JSON.stringify({ version_id: created.id, revision, state })],
    );
    await transition(1, 'review');
    await expect(query('select public.save_work_plan_draft($1::jsonb)', [JSON.stringify({
      name: definition.name,
      steps: definition.steps,
      dependencies: [],
      version_id: created.id,
      revision: 2,
    })])).rejects.toThrow('Return this Work Plan version to draft');
    await expect(transition(1, 'draft')).rejects.toThrow('changed; reload');
    await transition(2, 'draft');
    await transition(3, 'review');
    await query('select public.release_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: created.id, revision: 4,
    })]);
    const versions = z.array(z.object({ id: z.uuid(), work_plan_id: z.uuid() })).parse(
      z.object({ value: z.unknown() }).parse((await query('select public.list_work_plan_versions() value')).rows[0]).value,
    );
    const plan = versions.find((version) => version.id === created.id);
    if (!plan) throw new Error('Created Work Plan missing');
    const clonePayload = JSON.stringify({ work_plan_id: plan.work_plan_id, request_id: id(901) });
    const clone = z.object({ id: z.uuid() }).parse((await query('select public.create_work_plan_draft_version($1::jsonb) id', [clonePayload])).rows[0]);
    const clonedVersions = workPlanVersionsSchema.parse(z.object({ value: z.unknown() })
      .parse((await query('select public.list_work_plan_versions() value')).rows[0]).value);
    const clonedVersion = clonedVersions.find((version) => version.id === clone.id);
    expect(clonedVersion?.steps[0]?.optional).toBe(true);
    await query('select public.release_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: clone.id, revision: 1,
    })]);
    await expect(query('select public.create_work_plan_draft_version($1::jsonb) id', [clonePayload]))
      .resolves.toMatchObject({ rows: [clone] });
    await transition(5, 'retired');
    await expect(transition(6, 'draft')).rejects.toThrow('Invalid Work Plan lifecycle transition');
    await database.exec('reset role');
    expect((await query('select state,revision,released_by from public.work_plan_versions where id=$1', [created.id])).rows)
      .toEqual([{ state: 'retired', revision: 6, released_by: gateActor }]);
    expect((await query('select task_template from public.work_plan_steps where work_plan_version_id=$1', [created.id])).rows)
      .toEqual([{ task_template: { instructions: 'Preserve this evidence.', requires_verification: true, optional: true } }]);
    await expect(query("update public.work_plan_versions set name='Changed' where id=$1", [created.id]))
      .rejects.toThrow('immutable');
    await expect(query("update public.work_plan_versions set name='Changed',state='retired',revision=revision+1 where id=$1", [clone.id]))
      .rejects.toThrow('immutable');
    expect((await query(`select count(*)::int count from public.audit_events
      where entity_id=$1 and event_type='WORK_PLAN_LIFECYCLE_CHANGED'`, [created.id])).rows)
      .toEqual([{ count: 4 }]);
    await actAs(gateActor);
  });

  it('denies lifecycle and clone operations outside the authorized facility or without permission', async () => {
    await actAs(id(950));
    await expect(query('select public.transition_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: versionId, revision: 2, state: 'retired',
    })])).rejects.toThrow('permission required');
    await expect(query('select public.create_work_plan_draft_version($1::jsonb)', [JSON.stringify({
      work_plan_id: planId, request_id: id(900),
    })])).rejects.toThrow('permission required');
    await database.exec('reset role');
    await query(
      'insert into public.facilities(id,organization_id,name) values($1,$2,$3)',
      [id(951), organizationId, 'Other facility'],
    );
    await query('update public.profiles set facility_id=$1 where id=$2', [id(951), gateActor]);
    await actAs(gateActor);
    await expect(query('select public.transition_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: versionId, revision: 2, state: 'retired',
    })])).rejects.toThrow('unavailable');
    await expect(query('select public.create_work_plan_draft_version($1::jsonb)', [JSON.stringify({
      work_plan_id: planId, request_id: id(900),
    })])).rejects.toThrow('unavailable');
    await database.exec('reset role');
    await query('update public.profiles set facility_id=$1 where id=$2', [facilityId, gateActor]);
    await actAs(gateActor);
  });

  it('rejects coerced JSON scalars and unknown nested fields before changing content or audit', async () => {
    const definition = {
      code: 'strict_json',
      name: 'Strict workflow',
      dependencies: [],
      steps: [{
        key: 'complete', title: 'Complete', materialization_policy: 'work_order', task_template: {},
      }],
    };
    const invalidDefinitions = [
      { ...definition, name: { bad: 1 } },
      { ...definition, name: false },
      { ...definition, steps: [{ ...definition.steps[0], title: 123 }] },
      { ...definition, steps: [{ ...definition.steps[0], title: { bad: 1 } }] },
      { ...definition, steps: [{ ...definition.steps[0], key: 123 }] },
      { ...definition, steps: [{ ...definition.steps[0], sort_order: 4 }] },
      { ...definition, steps: [{ ...definition.steps[0], worker_id: gateActor }] },
      { ...definition, dependencies: [{ predecessor_key: 123, successor_key: 'complete' }] },
      { ...definition, dependencies: [{ predecessor_key: 'complete', successor_key: 'other', extra: true }] },
    ];
    await invalidDefinitions.reduce(async (previous, payload) => {
      await previous;
      await expect(query('select public.create_work_plan($1::jsonb)', [JSON.stringify(payload)]))
        .rejects.toThrow('valid Work Plan definition');
    }, Promise.resolve());
    const created = z.object({ id: z.uuid() }).parse((await query('select public.create_work_plan($1::jsonb) id', [JSON.stringify(definition)])).rows[0]);
    const readVersions = async () => workPlanVersionsSchema.parse(z.object({ value: z.unknown() })
      .parse((await query('select public.list_work_plan_versions() value')).rows[0]).value);
    const original = (await readVersions()).find((value) => value.id === created.id);
    await [...invalidDefinitions, { ...definition, revision: '1' }].reduce(async (previous, value) => {
      await previous;
      const { code, ...payload } = value;
      await expect(query('select public.save_work_plan_draft($1::jsonb)', [JSON.stringify({
        version_id: created.id, revision: 1, ...payload,
      })])).rejects.toThrow('valid Work Plan definition');
      expect((await readVersions()).find((version) => version.id === created.id)).toEqual(original);
      expect(code).toBe('strict_json');
    }, Promise.resolve());
    await expect(query('select public.release_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: created.id, revision: '1',
    })])).rejects.toThrow('current Work Plan version');
    await expect(query('select public.transition_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: created.id, revision: '1', state: 'review',
    })])).rejects.toThrow('current Work Plan version');
    await database.exec('reset role');
    expect((await query(`select count(*)::int count from public.audit_events
      where entity_id=$1 and event_type='WORK_PLAN_DRAFT_SAVED'`, [created.id])).rows)
      .toEqual([{ count: 0 }]);
    expect((await query("select count(*)::int count from public.work_plans where code='strict_json'"))
      .rows).toEqual([{ count: 1 }]);
    await actAs(gateActor);
  });

  it('accepts a highly branched 100-step DAG and releases it without enumerating paths', async () => {
    const steps = Array.from({ length: 100 }, (_, index) => ({
      key: `step_${index}`,
      title: `Step ${index}`,
      materialization_policy: 'task_only',
      task_template: {},
    }));
    const dependencies = steps.flatMap((step, index) => steps.slice(index + 1, index + 3)
      .map((successor) => ({ predecessor_key: step.key, successor_key: successor.key })));
    const created = z.object({ id: z.uuid() }).parse((await query(
      'select public.create_work_plan($1::jsonb) id',
      [JSON.stringify({
        code: 'branched_workflow', name: 'Branched workflow', steps, dependencies,
      })],
    )).rows[0]);
    await query('select public.save_work_plan_draft($1::jsonb)', [JSON.stringify({
      version_id: created.id, revision: 1, name: 'Branched workflow', steps, dependencies,
    })]);
    await query('select public.release_work_plan_version($1::jsonb)', [JSON.stringify({
      version_id: created.id, revision: 2,
    })]);
  });

  it('creates a complete draft version through the authorized RPC', async () => {
    const result = await query('select public.create_work_plan($1::jsonb) id', [JSON.stringify({
      code: 'sanitation',
      name: 'Sanitation workflow',
      steps: [
        {
          key: 'clean',
          title: 'Clean',
          materialization_policy: 'work_order',
          task_template: {},
        },
        {
          key: 'verify',
          title: 'Verify',
          materialization_policy: 'task_only',
          task_template: { requires_verification: true },
        },
      ],
      dependencies: [{
        predecessor_key: 'clean',
        successor_key: 'verify',
      }],
    })]);
    const created = z.object({ id: z.uuid() }).parse(result.rows[0]);
    expect(created.id).toEqual(expect.any(String));
    await database.exec('reset role');
    expect((await query(`select version.state, count(step.id)::int as step_count
      from public.work_plan_versions version join public.work_plan_steps step
        on step.work_plan_version_id = version.id
      where version.id=$1 group by version.state`, [created.id])).rows)
      .toEqual([{ state: 'draft', step_count: 2 }]);
    await actAs(gateActor);
  });

  it('replaces a draft definition atomically while preserving its dependency graph', async () => {
    const draftPlanId = id(820);
    const draftVersionId = id(821);
    await database.exec('reset role');
    await query(`insert into public.work_plans(id,organization_id,facility_id,code,created_by)
      values($1,$2,$3,'editable_workflow',$4)`, [draftPlanId, organizationId, facilityId, gateActor]);
    await query(`insert into public.work_plan_versions(
      id,organization_id,facility_id,work_plan_id,version_number,name,created_by
    ) values($1,$2,$3,$4,1,'Editable workflow',$5)`, [
      draftVersionId, organizationId, facilityId, draftPlanId, gateActor,
    ]);
    await actAs(gateActor);
    await query('select public.save_work_plan_draft($1::jsonb)', [JSON.stringify({
      version_id: draftVersionId,
      revision: 1,
      name: 'Updated standard production',
      steps: [
        {
          key: 'prepare',
          title: 'Prepare materials',
          materialization_policy: 'work_order',
          task_template: { instructions: 'Weigh approved ingredients before mixing.', optional: true },
        },
        {
          key: 'mix', title: 'Mix batch', materialization_policy: 'work_order', task_template: {},
        },
      ],
      dependencies: [{ predecessor_key: 'prepare', successor_key: 'mix' }],
    })]);
    const listed = await query('select public.list_work_plan_versions() as versions');
    const summaries = z.object({
      versions: z.array(z.object({
        id: z.uuid(),
        steps: z.array(z.object({
          key: z.string(), instructions: z.string(), optional: z.boolean(),
        })),
      })),
    }).parse(listed.rows[0]);
    expect(summaries.versions.find((version) => version.id === draftVersionId)?.steps)
      .toContainEqual({
        key: 'prepare', instructions: 'Weigh approved ingredients before mixing.', optional: true,
      });
    await database.exec('reset role');
    expect((await query('select name,revision from public.work_plan_versions where id=$1', [draftVersionId])).rows)
      .toEqual([{ name: 'Updated standard production', revision: 2 }]);
    expect((await query(`select predecessor.step_key,successor.step_key as successor_key
      from public.work_plan_step_dependencies dependency
      join public.work_plan_steps predecessor on predecessor.id=dependency.predecessor_step_id
      join public.work_plan_steps successor on successor.id=dependency.successor_step_id
      where dependency.work_plan_version_id=$1`, [draftVersionId])).rows)
      .toEqual([{ step_key: 'prepare', successor_key: 'mix' }]);
    await actAs(gateActor);
    const invalidDraft = {
      version_id: draftVersionId,
      revision: 2,
      name: 'Invalid cyclic replacement',
      steps: [
        {
          key: 'prepare', title: 'Prepare', materialization_policy: 'work_order', task_template: {},
        },
        {
          key: 'mix', title: 'Mix', materialization_policy: 'work_order', task_template: {},
        },
      ],
      dependencies: [
        { predecessor_key: 'prepare', successor_key: 'mix' },
        { predecessor_key: 'mix', successor_key: 'prepare' },
      ],
    };
    await expect(query('select public.save_work_plan_draft($1::jsonb)', [
      JSON.stringify(invalidDraft),
    ])).rejects.toThrow('cannot contain a cycle');
    await expect(query('select public.save_work_plan_draft($1::jsonb)', [
      JSON.stringify({ ...invalidDraft, revision: 1 }),
    ])).rejects.toThrow('changed; reload');
    await database.exec('reset role');
    expect((await query('select name,revision from public.work_plan_versions where id=$1', [draftVersionId])).rows)
      .toEqual([{ name: 'Updated standard production', revision: 2 }]);
    expect((await query('select count(*)::int as count from public.work_plan_step_dependencies where work_plan_version_id=$1', [draftVersionId])).rows)
      .toEqual([{ count: 1 }]);
    await actAs(gateActor);
  });
});
