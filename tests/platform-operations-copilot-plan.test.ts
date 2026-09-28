import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const ORGANIZATION_ID = '00000000-0000-4000-8000-000000000010';

it('keeps Operations Copilot plan changes platform-only and audit-backed', async () => {
  const db = new PGlite();
  try {
    await initializeGateDatabase((sql) => db.exec(sql));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
    await db.exec('set role authenticated');
    await expect(db.query(
      'select public.set_platform_operations_copilot_plan($1,$2,$3,$4)',
      [gateActor, ORGANIZATION_ID, true, 'Tenant attempted enablement'],
    )).rejects.toThrow('permission denied');
    await expect(db.query(
      'update public.organizations set operations_copilot_plan_enabled=true where id=$1',
      [ORGANIZATION_ID],
    )).rejects.toThrow('permission denied');
    await db.exec('reset role');

    await expect(db.query(
      'select public.set_platform_operations_copilot_plan($1,$2,$3,$4)',
      [gateActor, ORGANIZATION_ID, true, 'Premium subscription activated'],
    )).rejects.toThrow('Platform administrator required');

    await db.query('insert into public.platform_admins(user_id) values($1)', [gateActor]);
    await db.exec('set role service_role');
    expect((await db.query(
      `select operations_copilot_plan_enabled
       from public.list_platform_organizations($1)
       where id=$2`,
      [gateActor, ORGANIZATION_ID],
    )).rows).toEqual([{ operations_copilot_plan_enabled: false }]);

    await db.query(
      'select public.set_platform_operations_copilot_plan($1,$2,$3,$4)',
      [gateActor, ORGANIZATION_ID, true, 'Premium subscription activated'],
    );
    expect((await db.query(
      `select operations_copilot_plan_enabled
       from public.list_platform_organizations($1)
       where id=$2`,
      [gateActor, ORGANIZATION_ID],
    )).rows).toEqual([{ operations_copilot_plan_enabled: true }]);
    await db.query(
      'select public.set_platform_operations_copilot_plan($1,$2,$3,$4)',
      [gateActor, ORGANIZATION_ID, true, 'Duplicate request'],
    );
    await expect(db.query(
      'select public.set_platform_operations_copilot_plan($1,$2,$3,$4)',
      [gateActor, ORGANIZATION_ID, false, 'x'],
    )).rejects.toThrow('Invalid Operations Copilot plan change');
    await db.query(
      'select public.set_platform_operations_copilot_plan($1,$2,$3,$4)',
      [gateActor, ORGANIZATION_ID, false, 'Premium subscription ended'],
    );
    await db.exec('reset role');

    const events = await db.query<{
      event_type: string;
      before_data: { enabled: boolean };
      after_data: { enabled: boolean; reason: string };
    }>(
      `select event_type, before_data, after_data
       from public.audit_events
       where organization_id=$1 and event_type='OPERATIONS_COPILOT_PLAN_CHANGED'
       order by occurred_at`,
      [ORGANIZATION_ID],
    );
    expect(events.rows).toEqual([
      {
        event_type: 'OPERATIONS_COPILOT_PLAN_CHANGED',
        before_data: { enabled: false },
        after_data: { enabled: true, reason: 'Premium subscription activated' },
      },
      {
        event_type: 'OPERATIONS_COPILOT_PLAN_CHANGED',
        before_data: { enabled: true },
        after_data: { enabled: false, reason: 'Premium subscription ended' },
      },
    ]);
  } finally {
    await db.close();
  }
});
