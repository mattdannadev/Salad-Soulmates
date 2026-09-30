import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const owner = '00000000-0000-4000-8000-000000000009';
const account = '00000000-0000-4000-8000-000000000020';
const tenant = '00000000-0000-4000-8000-000000000010';
const job = '00000000-0000-4000-8000-000000000030';
const key = '00000000-0000-4000-8000-000000000031';
const link = '00000000-0000-4000-8000-000000000032';
const invitationReference = '00000000-0000-4000-8000-000000000033';
const support = '00000000-0000-4000-8000-000000000034';

async function setup() {
  const db = new PGlite();
  await initializeGateDatabase(async (sql) => {
    if (sql.includes('create table public.provider_roles')) {
      await db.query('insert into auth.users(id,email) values($1,$2)', [
        owner,
        'mattdanna@gmail.com',
      ]);
    }
    await db.exec(sql);
  });
  await db.query('insert into public.customer_accounts(id,name) values($1,$2)', [
    account, 'Acme Foods',
  ]);
  await db.query(
    `insert into public.tenant_account_links
      (id,account_id,organization_id,approved_by,approval_reason)
      values($1,$2,$3,$4,'Explicit provider approval')`,
    [link, account, tenant, owner],
  );
  await db.query('insert into auth.users(id,email) values($1,$2)', [
    support, 'support@example.test',
  ]);
  await db.query(`insert into public.provider_role_assignments(user_id,role_code)
    values($1,'provider_operations'),($2,'provider_support_readonly')`, [gateActor, support]);
  return db;
}

it('records one idempotent public-cloud job and requires delivery plus approved link for readiness', async () => {
  const db = await setup();
  try {
    await db.query(
      `insert into public.provisioning_jobs
        (id,account_id,idempotency_key,requested_by,
         requested_organization_name,requested_organization_slug)
       values($1,$2,$3,$4,'Acme Kitchen','acme-kitchen')`,
      [job, account, key, owner],
    );
    await expect(db.query(
      `insert into public.provisioning_jobs
        (account_id,idempotency_key,requested_by,
         requested_organization_name,requested_organization_slug)
       values($1,$2,$3,'Other Kitchen','other-kitchen')`,
      [account, key, owner],
    )).rejects.toMatchObject({ code: '23505' });
    await expect(db.query(`update public.provisioning_jobs
       set status='active', readiness_state='ready',
           started_at=now(), finished_at=now(), attempt_count=1
       where id=$1`, [job])).rejects.toMatchObject({ code: '23514' });
    await db.query('update public.tenant_account_links set archived_at=now() where id=$1', [link]);
    await expect(db.query(`update public.provisioning_jobs
       set status='active', readiness_state='ready', organization_id=$2,
           approved_link_id=$3, started_at=now(), finished_at=now(),
           initial_admin_invitation_reference=$4,
           initial_admin_auth_user_id=$5,
           initial_admin_invitation_state='delivered',
           invitation_delivered_at=now(), attempt_count=1
       where id=$1`, [job, tenant, link, invitationReference, support]))
      .rejects.toMatchObject({ code: '23514' });
    await db.query('update public.tenant_account_links set archived_at=null where id=$1', [link]);
    await db.query('update public.organizations set status=$2 where id=$1', [tenant, 'suspended']);
    await expect(db.query(`update public.provisioning_jobs
       set status='active', readiness_state='ready', organization_id=$2,
           approved_link_id=$3, started_at=now(), finished_at=now(),
           initial_admin_invitation_reference=$4,
           initial_admin_auth_user_id=$5,
           initial_admin_invitation_state='delivered',
           invitation_delivered_at=now(), attempt_count=1
       where id=$1`, [job, tenant, link, invitationReference, support]))
      .rejects.toMatchObject({ code: '23514' });
    await db.query('update public.organizations set status=$2 where id=$1', [tenant, 'active']);
    await db.query(`update public.provisioning_jobs
       set status='active', readiness_state='ready', organization_id=$2,
           approved_link_id=$3, started_at=now(), finished_at=now(),
           initial_admin_invitation_reference=$4,
           initial_admin_auth_user_id=$5,
           initial_admin_invitation_state='delivered',
           invitation_delivered_at=now(), attempt_count=1
       where id=$1`, [job, tenant, link, invitationReference, support]);
    expect((await db.query(`select status,readiness_state,initial_admin_invitation_state,
      invitation_delivered_at is not null as delivered
       from public.provisioning_jobs where id=$1`, [job])).rows).toEqual([{
      status: 'active',
      readiness_state: 'ready',
      initial_admin_invitation_state: 'delivered',
      delivered: true,
    }]);
  } finally {
    await db.close();
  }
});

it('tracks redacted invitation recovery state and maintains updated_at', async () => {
  const db = await setup();
  try {
    await db.query(`insert into public.provisioning_jobs
      (id,account_id,idempotency_key,requested_by,
       requested_organization_name,requested_organization_slug)
      values($1,$2,$3,$4,'Acme Kitchen','acme-kitchen')`, [job, account, key, owner]);
    const { rows: original } = await db.query<{ updated_at: Date }>('select updated_at from public.provisioning_jobs where id=$1', [job]);
    await db.query(`update public.provisioning_jobs
      set initial_admin_invitation_reference=$2,
          initial_admin_invitation_state='pending',
          updated_at='2000-01-01T00:00:00Z'
      where id=$1`, [job, invitationReference]);
    const { rows: pending } = await db.query<{
      updated_at: Date; initial_admin_invitation_state: string;
    }>('select updated_at,initial_admin_invitation_state from public.provisioning_jobs where id=$1', [job]);
    expect(pending[0]?.initial_admin_invitation_state).toBe('pending');
    const originalUpdatedAt = original[0]?.updated_at.getTime() ?? 0;
    expect(pending[0]?.updated_at.getTime()).toBeGreaterThanOrEqual(originalUpdatedAt);
    await db.query(`update public.provisioning_jobs
      set initial_admin_invitation_state='expired',
          initial_admin_invitation_expires_at=now()
      where id=$1`, [job]);
    expect((await db.query('select initial_admin_invitation_state from public.provisioning_jobs where id=$1', [job])).rows).toEqual([{ initial_admin_invitation_state: 'expired' }]);
    await db.query(`update public.provisioning_jobs
      set initial_admin_invitation_state='failed',
          safe_invitation_failure_code='DELIVERY_REJECTED'
      where id=$1`, [job]);
    expect((await db.query('select safe_invitation_failure_code from public.provisioning_jobs where id=$1', [job])).rows).toEqual([{ safe_invitation_failure_code: 'DELIVERY_REJECTED' }]);
  } finally {
    await db.close();
  }
});

it('allows only Provider Owner read RPCs and returns redacted status metadata', async () => {
  const db = await setup();
  try {
    await db.query(
      `insert into public.provisioning_jobs
        (id,account_id,idempotency_key,requested_by,
         requested_organization_name,requested_organization_slug)
       values($1,$2,$3,$4,'Acme Kitchen','acme-kitchen')`,
      [job, account, key, owner],
    );
    await db.exec('set role service_role');
    const { rows } = await db.query('select * from public.list_provider_provisioning_jobs($1)', [owner]);
    expect(rows).toEqual([expect.objectContaining({
      id: job,
      account_id: account,
      account_name: 'Acme Foods',
      organization_id: null,
      status: 'draft',
      readiness_state: 'not_ready',
    })]);
    expect(JSON.stringify(rows)).not.toContain('idempotency_key');
    expect(JSON.stringify(rows)).not.toContain('requested_by');
    expect(JSON.stringify(rows)).not.toContain('initial_admin_auth_user_id');
    expect(JSON.stringify(rows)).not.toContain('initial_admin_invitation_reference');
    expect((await db.query('select id from public.get_provider_provisioning_job($1,$2)', [owner, job])).rows).toEqual([{ id: job }]);
    await expect(db.query('select * from public.provisioning_jobs'))
      .rejects.toThrow('permission denied');
    await expect(db.query(`insert into public.provisioning_jobs
      (account_id,idempotency_key,requested_by,
       requested_organization_name,requested_organization_slug)
      values($1,$2,$3,'Other Kitchen','other-kitchen')`, [account, key, owner]))
      .rejects.toThrow('permission denied');
    await expect(db.query(`update public.provisioning_jobs
      set requested_organization_name='Changed' where id=$1`, [job]))
      .rejects.toThrow('permission denied');
    await expect(db.query('delete from public.provisioning_jobs where id=$1', [job]))
      .rejects.toThrow('permission denied');
    await expect(db.query('select * from public.list_provider_provisioning_jobs($1)', [gateActor]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select * from public.list_provider_provisioning_jobs($1)', [support]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select * from public.get_provider_provisioning_job($1,$2)', [gateActor, job]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select * from public.get_provider_provisioning_job($1,$2)', [support, job]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select * from public.get_provider_provisioning_job($1,$2)', [owner, key]))
      .rejects.toMatchObject({ code: 'P0002' });
    await db.exec('reset role');
    expect((await db.query(
      `select event_type,target_provisioning_job_id
       from public.provider_audit_events
       where event_type like 'PROVIDER_PROVISIONING_%' order by event_type`,
    )).rows).toEqual([
      { event_type: 'PROVIDER_PROVISIONING_DETAIL_READ', target_provisioning_job_id: job },
      { event_type: 'PROVIDER_PROVISIONING_DIRECTORY_READ', target_provisioning_job_id: null },
    ]);
    await db.exec('set role authenticated');
    await expect(db.query('select * from public.list_provider_provisioning_jobs($1)', [owner]))
      .rejects.toThrow('permission denied');
    await db.exec('set role anon');
    await expect(db.query('select * from public.provisioning_jobs'))
      .rejects.toThrow('permission denied');
    await expect(db.query(`insert into public.provisioning_jobs
      (account_id,idempotency_key,requested_by,
       requested_organization_name,requested_organization_slug)
      values($1,$2,$3,'Other Kitchen','other-kitchen')`, [account, key, owner]))
      .rejects.toThrow('permission denied');
    await expect(db.query(`update public.provisioning_jobs
      set requested_organization_name='Changed' where id=$1`, [job]))
      .rejects.toThrow('permission denied');
    await expect(db.query('delete from public.provisioning_jobs where id=$1', [job]))
      .rejects.toThrow('permission denied');
    await expect(db.query('select * from public.list_provider_provisioning_jobs($1)', [owner]))
      .rejects.toThrow('permission denied');
    await expect(db.query('select * from public.get_provider_provisioning_job($1,$2)', [owner, job]))
      .rejects.toThrow('permission denied');
  } finally {
    await db.close();
  }
});
