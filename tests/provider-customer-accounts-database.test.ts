import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const owner = '00000000-0000-4000-8000-000000000009';
const account = '00000000-0000-4000-8000-000000000020';
const otherAccount = '00000000-0000-4000-8000-000000000021';
const tenant = '00000000-0000-4000-8000-000000000010';
const otherTenant = '00000000-0000-4000-8000-000000000022';
const customerOnlyActor = '00000000-0000-4000-8000-000000000023';

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
  await db.query(
    `insert into public.customer_accounts(id,name,status)
     values($1,'Acme Foods','active'),($2,'Older Foods','archived')`,
    [account, otherAccount],
  );
  await db.query(
    `insert into public.customer_contacts(account_id,full_name,email,phone)
     values($1,'Private Person','private@example.test','555-0100')`,
    [account],
  );
  await db.query(
    `insert into public.tenant_account_links(account_id,organization_id,approved_by,approval_reason)
     values($1,$2,$3,'Explicit provider approval')`,
    [account, tenant, owner],
  );
  return db;
}

it('keeps links explicit, unique while current, and archives history', async () => {
  const db = await setup();
  try {
    expect((await db.query('select count(*)::int as count from public.tenant_account_links')).rows)
      .toEqual([{ count: 1 }]);
    await db.query(
      `insert into public.organizations(id,name,slug)
       values($1,'Other tenant','other-tenant')`,
      [otherTenant],
    );
    await expect(db.query(
      `insert into public.tenant_account_links
       (account_id,organization_id,approved_by,approval_reason)
       values($1,$2,$3,'Duplicate account')`,
      [account, otherTenant, owner],
    )).rejects.toMatchObject({ code: '23505' });
    await expect(db.query(
      `insert into public.tenant_account_links
       (account_id,organization_id,approved_by,approval_reason)
       values($1,$2,$3,'Duplicate tenant')`,
      [otherAccount, tenant, owner],
    )).rejects.toMatchObject({ code: '23505' });
    await db.query(
      `update public.tenant_account_links set archived_at=now()
       where account_id=$1`,
      [account],
    );
    await db.query(
      `insert into public.tenant_account_links
       (account_id,organization_id,approved_by,approval_reason)
       values($1,$2,$3,'Approved replacement')`,
      [account, otherTenant, owner],
    );
    expect((await db.query(`select count(*)::int as count from public.tenant_account_links
       where account_id=$1`, [account])).rows).toEqual([{ count: 2 }]);
  } finally {
    await db.close();
  }
});

it('limits customer reads to narrow RPCs and redacts contact details', async () => {
  const db = await setup();
  try {
    expect((await db.query(
      'select code, permissions from public.provider_roles order by code',
    )).rows).toEqual([
      { code: 'provider_billing', permissions: [] },
      { code: 'provider_operations', permissions: ['tenants.read', 'customers.read'] },
      { code: 'provider_owner', permissions: ['tenants.read', 'customers.read'] },
      { code: 'provider_support_readonly', permissions: ['tenants.read', 'customers.read'] },
    ]);
    await db.exec('set role service_role');
    expect((await db.query('select * from public.list_provider_customer_accounts($1)', [owner])).rows).toEqual([
      expect.objectContaining({ id: account, name: 'Acme Foods', active_tenant_count: 1 }),
      expect.objectContaining({ id: otherAccount, name: 'Older Foods', active_tenant_count: 0 }),
    ]);
    const detail = (await db.query('select * from public.get_provider_customer_account($1,$2)', [owner, account])).rows;
    expect(detail).toEqual([
      expect.objectContaining({ id: account, active_tenant_count: 1 }),
    ]);
    expect(JSON.stringify(detail)).not.toContain('private@example.test');
    expect((await db.query(
      'select * from public.list_provider_customer_account_tenants($1,$2)',
      [owner, account],
    )).rows).toEqual([
      expect.objectContaining({ id: tenant, name: 'Concurrency fixture' }),
    ]);
    expect((await db.query(
      'select linked_account_id,linked_account_name,linked_account_status from public.get_provider_tenant_detail($1,$2)',
      [owner, tenant],
    )).rows).toEqual([{
      linked_account_id: account,
      linked_account_name: 'Acme Foods',
      linked_account_status: 'active',
    }]);
    await expect(db.query('select * from public.customer_contacts'))
      .rejects.toThrow('permission denied');
    await expect(db.query('select * from public.customer_accounts'))
      .rejects.toThrow('permission denied');
    await expect(db.query('select * from public.tenant_account_links'))
      .rejects.toThrow('permission denied');
    await expect(db.query('select * from public.list_provider_customer_accounts($1)', [gateActor]))
      .rejects.toMatchObject({ code: '42501' });
    await expect(db.query('select * from public.get_provider_customer_account($1,$2)', [owner, otherTenant]))
      .rejects.toMatchObject({ code: 'P0002' });
    await db.exec('reset role');
    expect((await db.query(
      `select event_type,target_account_id,effective_permission,details
       from public.provider_audit_events
       where event_type like 'PROVIDER_CUSTOMER_%'
       order by event_type`,
    )).rows).toEqual([
      {
        event_type: 'PROVIDER_CUSTOMER_DETAIL_READ',
        target_account_id: account,
        effective_permission: 'customers.read',
        details: { surface: 'provider_console', outcome: 'success' },
      },
      {
        event_type: 'PROVIDER_CUSTOMER_DIRECTORY_READ',
        target_account_id: null,
        effective_permission: 'customers.read',
        details: { surface: 'provider_console', outcome: 'success' },
      },
      {
        event_type: 'PROVIDER_CUSTOMER_TENANTS_READ',
        target_account_id: account,
        effective_permission: 'customers.read+tenants.read',
        details: { surface: 'provider_console', outcome: 'success' },
      },
    ]);
    await db.exec('set role authenticated');
    await expect(db.query('select * from public.list_provider_customer_accounts($1)', [owner]))
      .rejects.toThrow('permission denied');
    await expect(db.query('select * from public.get_provider_customer_account($1,$2)', [owner, account]))
      .rejects.toThrow('permission denied');
  } finally {
    await db.close();
  }
});

it('requires both permissions for cross-directory navigation and hides archived links', async () => {
  const db = await setup();
  try {
    await db.query('insert into auth.users(id,email) values($1,$2)', [
      customerOnlyActor, 'customer-only@example.test',
    ]);
    await db.exec(`
      insert into public.provider_roles(code,name,description,permissions) values
        ('provider_tenant_only','Tenant only','Test tenant reader',array['tenants.read']),
        ('provider_customer_only','Customer only','Test customer reader',array['customers.read']);
    `);
    await db.query(
      `insert into public.provider_role_assignments(user_id,role_code) values
       ($1,'provider_tenant_only'),($2,'provider_customer_only')`,
      [gateActor, customerOnlyActor],
    );
    await db.exec('set role service_role');
    expect((await db.query(`select linked_account_id,linked_account_name,linked_account_status
       from public.get_provider_tenant_detail($1,$2)`, [gateActor, tenant])).rows).toEqual([{
      linked_account_id: null, linked_account_name: null, linked_account_status: null,
    }]);
    await expect(db.query(
      'select * from public.list_provider_customer_account_tenants($1,$2)',
      [gateActor, account],
    )).rejects.toMatchObject({ code: '42501' });
    expect((await db.query(
      'select id from public.get_provider_customer_account($1,$2)',
      [customerOnlyActor, account],
    )).rows).toEqual([{ id: account }]);
    await expect(db.query(
      'select * from public.list_provider_customer_account_tenants($1,$2)',
      [customerOnlyActor, account],
    )).rejects.toMatchObject({ code: '42501' });
    await expect(db.query(
      'select * from public.get_provider_tenant_detail($1,$2)',
      [customerOnlyActor, tenant],
    )).rejects.toMatchObject({ code: '42501' });
    await db.exec('reset role');
    await db.query('update public.tenant_account_links set archived_at=now()');
    await db.exec('set role service_role');
    expect((await db.query(`select linked_account_id,linked_account_name,linked_account_status
       from public.get_provider_tenant_detail($1,$2)`, [owner, tenant])).rows).toEqual([{
      linked_account_id: null, linked_account_name: null, linked_account_status: null,
    }]);
    expect((await db.query(
      'select active_tenant_count from public.get_provider_customer_account($1,$2)',
      [owner, account],
    )).rows).toEqual([{ active_tenant_count: 0 }]);
    expect((await db.query(
      'select * from public.list_provider_customer_account_tenants($1,$2)',
      [owner, account],
    )).rows).toEqual([]);
  } finally {
    await db.close();
  }
});
