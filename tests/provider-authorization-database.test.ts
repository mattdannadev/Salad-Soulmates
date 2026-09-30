import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const ownerId = '00000000-0000-4000-8000-000000000009';

it('bootstraps only the exact provider owner and audits the assignment', async () => {
  const db = new PGlite();
  try {
    await initializeGateDatabase(async (sql) => {
      if (sql.includes('create table public.provider_roles')) {
        await db.query('insert into auth.users(id,email) values($1,$2)', [
          ownerId,
          'mattdanna@gmail.com',
        ]);
      }
      await db.exec(sql);
    });
    expect(
      (await db.query('select user_id, role_code from public.provider_role_assignments')).rows,
    ).toEqual([{ user_id: ownerId, role_code: 'provider_owner' }]);
    expect(
      (
        await db.query(
          'select subject_user_id, event_type, details from public.provider_audit_events',
        )
      ).rows,
    ).toEqual([
      {
        subject_user_id: ownerId,
        event_type: 'PROVIDER_OWNER_BOOTSTRAPPED',
        details: { role_code: 'provider_owner', source: 'migration' },
      },
    ]);
    expect(
      (await db.query('select count(*)::integer as count from public.platform_admins')).rows,
    ).toEqual([{ count: 0 }]);

    await db.exec('set role service_role');
    expect(
      (
        await db.query('select public.has_provider_permission($1,$2) as allowed', [
          ownerId,
          'tenants.read',
        ])
      ).rows,
    ).toEqual([{ allowed: true }]);
    expect(
      (
        await db.query('select public.has_provider_permission($1,$2) as allowed', [
          gateActor,
          'tenants.read',
        ])
      ).rows,
    ).toEqual([{ allowed: false }]);
    expect(
      (
        await db.query(
          'select name, enabled_user_count, facility_count from public.list_provider_tenants($1)',
          [ownerId],
        )
      ).rows,
    ).toEqual([
      {
        name: 'Concurrency fixture',
        enabled_user_count: 1,
        facility_count: 1,
      },
    ]);
    expect(
      (
        await db.query(
          'select id, name, slug, status, created_at, enabled_user_count, facility_count from public.get_provider_tenant_detail($1,$2)',
          [ownerId, '00000000-0000-4000-8000-000000000010'],
        )
      ).rows,
    ).toEqual([
      expect.objectContaining({
        id: '00000000-0000-4000-8000-000000000010',
        name: 'Concurrency fixture',
        slug: 'concurrency-fixture',
        enabled_user_count: 1,
        facility_count: 1,
      }),
    ]);
    await expect(
      db.query('select * from public.get_provider_tenant_detail($1,$2)', [
        ownerId,
        '00000000-0000-4000-8000-000000000099',
      ]),
    ).rejects.toMatchObject({ code: 'P0002' });
    await expect(
      db.query('select * from public.list_provider_tenants($1)', [gateActor]),
    ).rejects.toThrow('Provider permission required');
    await expect(
      db.query('select * from public.get_provider_tenant_detail($1,$2)', [
        gateActor,
        '00000000-0000-4000-8000-000000000010',
      ]),
    ).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role');
    expect(
      (
        await db.query(
          `select event_type, actor_user_id, target_organization_id,
                  effective_permission, details
           from public.provider_audit_events
           where event_type like 'PROVIDER_TENANT_%'
           order by event_type`,
        )
      ).rows,
    ).toEqual([
      {
        event_type: 'PROVIDER_TENANT_DETAIL_READ',
        actor_user_id: ownerId,
        target_organization_id: '00000000-0000-4000-8000-000000000010',
        effective_permission: 'tenants.read',
        details: { surface: 'provider_console', outcome: 'success' },
      },
      {
        event_type: 'PROVIDER_TENANT_DIRECTORY_READ',
        actor_user_id: ownerId,
        target_organization_id: null,
        effective_permission: 'tenants.read',
        details: { surface: 'provider_console', outcome: 'success' },
      },
    ]);
    await expect(
      db.query(
        `update public.provider_audit_events
         set details = '{}'::jsonb
         where event_type = 'PROVIDER_TENANT_DETAIL_READ'`,
      ),
    ).rejects.toThrow('Provider audit events are immutable');
    await expect(
      db.query(
        `delete from public.provider_audit_events
         where event_type = 'PROVIDER_TENANT_DETAIL_READ'`,
      ),
    ).rejects.toThrow('Provider audit events are immutable');
    await db.exec('set role service_role');
    await expect(
      db.query('insert into public.provider_role_assignments(user_id,role_code) values($1,$2)', [
        gateActor,
        'provider_owner',
      ]),
    ).rejects.toThrow('permission denied');

    await db.exec('reset role; set role authenticated');
    await expect(
      db.query('select * from public.list_provider_tenants($1)', [ownerId]),
    ).rejects.toThrow('permission denied');
    await expect(
      db.query('select * from public.get_provider_tenant_detail($1,$2)', [
        ownerId,
        '00000000-0000-4000-8000-000000000010',
      ]),
    ).rejects.toThrow('permission denied');
    await expect(db.query('select * from public.provider_role_assignments')).rejects.toThrow(
      'permission denied',
    );
  } finally {
    await db.close();
  }
});

it('does not promote a different Auth identity when the exact owner is absent', async () => {
  const db = new PGlite();
  try {
    await initializeGateDatabase((sql) => db.exec(sql));
    expect(
      (await db.query('select count(*)::integer as count from public.provider_role_assignments'))
        .rows,
    ).toEqual([{ count: 0 }]);
    expect(
      (await db.query('select count(*)::integer as count from public.provider_audit_events')).rows,
    ).toEqual([{ count: 0 }]);
  } finally {
    await db.close();
  }
});
