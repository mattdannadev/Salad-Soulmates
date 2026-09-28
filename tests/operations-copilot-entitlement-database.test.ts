import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
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
  await database.query('insert into auth.users(id,email) values($1,$2),($3,$4)', [
    id(2),
    'worker@example.test',
    id(3),
    'outside@example.test',
  ]);
  const workerProfile = (
    await database.query<{ id: string }>(
      "select id from public.access_profiles where organization_id=$1 and name='Production Worker'",
      [id(10)],
    )
  ).rows[0]?.id;
  await database.query(
    `insert into public.profiles(
      id, organization_id, facility_id, display_name, role, access_profile_id
    ) values($1,$2,$3,'Worker','worker',$4)`,
    [id(2), id(10), id(11), workerProfile],
  );
  await database.query(
    "insert into public.organizations(id,name,slug) values($1,'Outside','outside')",
    [id(20)],
  );
  await database.query(
    "insert into public.facilities(id,organization_id,name) values($1,$2,'Outside')",
    [id(21), id(20)],
  );
  await database.query(
    `insert into public.access_profiles(
      id, organization_id, name, base_role, is_system
    ) values($1,$2,'Outside administrator','admin',true)`,
    [id(22), id(20)],
  );
  await database.query(
    `insert into public.profiles(
      id, organization_id, facility_id, display_name, role, access_profile_id
    ) values($1,$2,$3,'Outside','admin',$4)`,
    [id(3), id(20), id(21), id(22)],
  );
});

afterAll(async () => {
  await database?.close();
});

describe('Operations Copilot database entitlement', () => {
  it('requires the plan ceiling and applies profile defaults with tri-state overrides', async () => {
    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: false }]);

    const workerProfile = z
      .object({ id: z.uuid() })
      .parse(
        (
          await asUser(
            id(1),
            "select id from public.access_profiles where name='Production Worker'",
          )
        ).rows[0],
      );
    await asUser(id(1), 'select public.set_operations_copilot_profile_default($1,$2)', [
      workerProfile.id,
      true,
    ]);
    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: false }]);

    await database.exec('reset role');
    await database.query(
      'update public.organizations set operations_copilot_plan_enabled=true where id=$1',
      [id(10)],
    );
    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: true }]);

    await asUser(id(1), 'select public.set_operations_copilot_user_override($1,$2)', [
      id(2),
      false,
    ]);
    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: false }]);

    await asUser(id(1), 'select public.set_operations_copilot_user_override($1,$2)', [id(2), null]);
    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: true }]);
  });

  it('does not let a user override bypass a disabled organization plan', async () => {
    await asUser(id(1), 'select public.set_operations_copilot_user_override($1,$2)', [id(2), true]);
    await database.exec('reset role');
    await database.query(
      'update public.organizations set operations_copilot_plan_enabled=false where id=$1',
      [id(10)],
    );

    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: false }]);
  });

  it('denies unauthorized and cross-organization setting changes', async () => {
    await expect(
      asUser(id(2), 'select public.set_operations_copilot_user_override($1,$2)', [id(2), true]),
    ).rejects.toThrow('Access management permission required');
    await expect(
      asUser(id(2), 'select public.set_operations_copilot_profile_default($1,$2)', [id(22), true]),
    ).rejects.toThrow('Settings permission required');
    await expect(
      asUser(id(1), 'select public.set_operations_copilot_user_override($1,$2)', [id(3), true]),
    ).rejects.toThrow('User must belong to your organization');
    await expect(
      asUser(id(1), 'select public.set_operations_copilot_profile_default($1,$2)', [id(22), true]),
    ).rejects.toThrow('Access profile must belong to your organization');
    await expect(
      asUser(
        id(1),
        "update public.access_profiles set operations_copilot_enabled=true where name='Production Worker'",
      ),
    ).rejects.toThrow('permission denied');

    await database.exec('reset role');
    expect(
      (
        await database.query(
          'select operations_copilot_override from public.profiles where id=$1',
          [id(3)],
        )
      ).rows,
    ).toEqual([{ operations_copilot_override: null }]);
    expect(
      (
        await database.query(
          'select operations_copilot_enabled from public.access_profiles where id=$1',
          [id(22)],
        )
      ).rows,
    ).toEqual([{ operations_copilot_enabled: false }]);
    expect(
      (
        await database.query(
          `select count(*)::integer as count from public.audit_events
       where entity_id in ($1,$2) and event_type like 'OPERATIONS_COPILOT_%'`,
          [id(3), id(22)],
        )
      ).rows,
    ).toEqual([{ count: 0 }]);
  });

  it('denies anonymous direct execution of every entitlement RPC', async () => {
    await database.exec('reset role; set role anon');
    await expect(database.query('select public.operations_copilot_enabled()')).rejects.toThrow(
      'permission denied',
    );
    await expect(
      database.query('select public.set_operations_copilot_profile_default($1,$2)', [id(22), true]),
    ).rejects.toThrow('permission denied');
    await expect(
      database.query('select public.set_operations_copilot_user_override($1,$2)', [id(3), true]),
    ).rejects.toThrow('permission denied');
    await database.exec('reset role');
  });

  it('denies authenticated calls without a signed-in identity', async () => {
    await database.exec('reset role');
    await database.query("select set_config('request.jwt.claim.sub','',false)");
    await database.exec('set role authenticated');
    expect(
      (await database.query('select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: false }]);
    await expect(
      database.query('select public.set_operations_copilot_profile_default($1,$2)', [id(22), true]),
    ).rejects.toThrow('Invalid Operations Copilot profile setting');
    await expect(
      database.query('select public.set_operations_copilot_user_override($1,$2)', [id(3), true]),
    ).rejects.toThrow('Authentication required');
    await database.exec('reset role');
  });

  it('prevents direct profile inserts from bypassing the audited Copilot default', async () => {
    await expect(
      asUser(
        id(1),
        `insert into public.access_profiles(
        organization_id, name, base_role, operations_copilot_enabled
      ) values($1,'Bypass profile','reviewer',true)`,
        [id(10)],
      ),
    ).rejects.toThrow('permission denied');

    await asUser(
      id(1),
      `insert into public.access_profiles(organization_id, name, base_role)
       values($1,'Custom reviewer','reviewer')`,
      [id(10)],
    );
    expect(
      (
        await asUser(
          id(1),
          `select operations_copilot_enabled
       from public.access_profiles
       where organization_id=$1 and name='Custom reviewer'`,
          [id(10)],
        )
      ).rows,
    ).toEqual([{ operations_copilot_enabled: false }]);
  });

  it('denies anonymous execution and inactive users', async () => {
    await database.exec('reset role; set role anon');
    await expect(database.query('select public.operations_copilot_enabled()')).rejects.toThrow(
      'permission denied',
    );

    await database.exec('reset role');
    await database.query(
      'update public.organizations set operations_copilot_plan_enabled=true where id=$1',
      [id(10)],
    );
    await database.query('update public.profiles set active=false where id=$1', [id(2)]);
    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: false }]);

    await database.exec('reset role');
    await database.query('update public.profiles set active=true where id=$1', [id(2)]);
    await database.query(
      `update public.access_profiles set active=false
       where id=(select access_profile_id from public.profiles where id=$1)`,
      [id(2)],
    );
    expect(
      (await asUser(id(2), 'select public.operations_copilot_enabled() as enabled')).rows,
    ).toEqual([{ enabled: false }]);
  });

  it('denies both direct setter RPCs when the caller access profile is inactive', async () => {
    await database.exec('reset role');
    const administratorProfile = (
      await database.query<{ id: string }>(
        'select access_profile_id as id from public.profiles where id=$1',
        [id(1)],
      )
    ).rows[0]?.id;
    const workerProfile = (
      await database.query<{ id: string }>(
        "select id from public.access_profiles where organization_id=$1 and name='Production Worker'",
        [id(10)],
      )
    ).rows[0]?.id;
    expect(administratorProfile).toBeDefined();
    expect(workerProfile).toBeDefined();
    const priorOverride = (
      await database.query<{ operations_copilot_override: boolean | null }>(
        'select operations_copilot_override from public.profiles where id=$1',
        [id(2)],
      )
    ).rows;
    const priorDefault = (
      await database.query<{ operations_copilot_enabled: boolean }>(
        'select operations_copilot_enabled from public.access_profiles where id=$1',
        [workerProfile],
      )
    ).rows;
    const priorAudit = (
      await database.query<{ count: number }>(
        `select count(*)::integer as count from public.audit_events
         where actor_user_id=$1 and event_type like 'OPERATIONS_COPILOT_%'`,
        [id(1)],
      )
    ).rows;

    await database.query('update public.access_profiles set active=false where id=$1', [
      administratorProfile,
    ]);
    try {
      expect((await asUser(id(1), 'select public.operations_copilot_enabled() as enabled')).rows)
        .toEqual([{ enabled: false }]);
      await expect(asUser(
        id(1),
        'select public.set_operations_copilot_profile_default($1,$2)',
        [workerProfile, true],
      )).rejects.toThrow('Settings permission required');
      await expect(asUser(
        id(1),
        'select public.set_operations_copilot_user_override($1,$2)',
        [id(2), true],
      )).rejects.toThrow('Access management permission required');
      await database.exec('reset role');
      expect((await database.query<{ operations_copilot_override: boolean | null }>(
        'select operations_copilot_override from public.profiles where id=$1',
        [id(2)],
      )).rows).toEqual(priorOverride);
      expect((await database.query<{ operations_copilot_enabled: boolean }>(
        'select operations_copilot_enabled from public.access_profiles where id=$1',
        [workerProfile],
      )).rows).toEqual(priorDefault);
      expect((await database.query<{ count: number }>(
        `select count(*)::integer as count from public.audit_events
         where actor_user_id=$1 and event_type like 'OPERATIONS_COPILOT_%'`,
        [id(1)],
      )).rows).toEqual(priorAudit);
    } finally {
      await database.exec('reset role');
      await database.query('update public.access_profiles set active=true where id=$1', [
        administratorProfile,
      ]);
    }
  });
});
