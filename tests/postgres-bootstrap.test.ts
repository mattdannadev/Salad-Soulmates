import { PGlite } from '@electric-sql/pglite';
import { expect, it } from 'vitest';
import { initializeGateDatabase, gateActor } from './integration/postgres-bootstrap';

it('initializes the native gate fixture with real migration permissions and RLS', async () => {
  const db = new PGlite();
  try {
    await initializeGateDatabase((sql) => db.exec(sql));
    await db.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
    await db.exec('set role authenticated');
    expect((await db.query('select count(*)::int as count from public.access_profile_permissions')).rows)
      .toEqual([{ count: 38 }]);
    expect((await db.query("select public.has_permission('inventory.receive') as allowed")).rows)
      .toEqual([{ allowed: true }]);
    await expect(db.query('select public.validate_inventory()')).rejects.toThrow('permission denied');
    await expect(db.query('select * from public.platform_admins')).rejects.toThrow('permission denied');
    await expect(db.query('select * from public.list_platform_organizations($1)', [gateActor])).rejects.toThrow('permission denied');
    await db.exec('reset role');
    await expect(db.query('select * from public.list_platform_organizations($1)', [gateActor])).rejects.toThrow('Platform administrator required');
    await db.query('insert into public.platform_admins(user_id) values($1)', [gateActor]);
    const organizations = await db.query(
      'select slug,enabled_user_count from public.list_platform_organizations($1) where slug=$2',
      [gateActor, 'concurrency-fixture'],
    );
    expect(organizations.rows).toEqual([{ slug: 'concurrency-fixture', enabled_user_count: 1 }]);
    // The canonical catalog lives on main; this release fixture exercises the
    // provisioning path once its tables have been installed.
    await db.exec(`
      create table public.uom_families (
        organization_id uuid not null references public.organizations,
        code text not null, label_en text not null, label_es text not null,
        sort_order integer not null, primary key (organization_id, code)
      );
      create table public.uoms (
        organization_id uuid not null references public.organizations,
        family_code text not null, code text not null,
        label_en text not null, label_es text not null,
        measurement_system text not null, is_inventory_unit boolean not null,
        is_purchase_unit boolean not null, sort_order integer not null,
        foreign key (organization_id, family_code)
          references public.uom_families(organization_id, code),
        unique (organization_id, code)
      );
    `);
    const newOrganization = await db.query<{ id: string }>(
      'select public.provision_platform_organization($1,$2,$3,$4,$5) as id',
      [gateActor, 'New Kitchen', 'new-kitchen', 'Main facility', 'America/Chicago'],
    );
    expect((await db.query(
      'select enabled_user_count from public.list_platform_organizations($1) where slug=$2',
      [gateActor, 'new-kitchen'],
    )).rows).toEqual([{ enabled_user_count: 0 }]);
    const newId = newOrganization.rows[0]?.id;
    expect(newId).toBeTruthy();
    expect((await db.query(
      'select code from public.uom_families where organization_id=$1 order by sort_order',
      [newId],
    )).rows).toEqual(['mass', 'volume', 'count', 'packaging'].map((code) => ({ code })));
    expect((await db.query(
      'select code from public.uoms where organization_id=$1 order by family_code,sort_order',
      [newId],
    )).rows).toEqual(
      ['each', 'lb', 'oz', 'kg', 'g', 'bag', 'case', 'pail', 'gal', 'fl_oz', 'l', 'ml']
        .map((code) => ({ code })),
    );
    await db.query(
      'select public.set_platform_organization_suspended($1,$2,$3,$4)',
      [gateActor, newId, true, 'Billing hold'],
    );
    expect((await db.query(
      'select status,signup_enabled from public.organizations where id=$1',
      [newId],
    )).rows).toEqual([{ status: 'suspended', signup_enabled: false }]);
    expect((await db.query<{ event_type: string }>(
      'select event_type from public.audit_events where organization_id=$1 order by occurred_at',
      [newId],
    )).rows.map((row) => row.event_type)).toEqual([
      'ORGANIZATION_PROVISIONED', 'ORGANIZATION_SUSPENDED',
    ]);
    await expect(db.query(
      'select public.set_platform_organization_suspended($1,$2,$3,$4)',
      [gateActor, newId, false, 'x'],
    )).rejects.toThrow('Invalid status change');
    await db.query(
      'select public.set_platform_organization_suspended($1,$2,$3,$4)',
      [gateActor, newId, false, 'Hold resolved'],
    );
    expect((await db.query(
      'select status,signup_enabled from public.organizations where id=$1',
      [newId],
    )).rows).toEqual([{ status: 'active', signup_enabled: true }]);
    const tenantId = '00000000-0000-4000-8000-000000000010';
    await db.query('update public.organizations set signup_enabled=false where id=$1', [tenantId]);
    await db.query(
      'select public.set_platform_organization_suspended($1,$2,$3,$4)',
      [gateActor, tenantId, true, 'Access hold'],
    );
    await db.exec('set role authenticated');
    expect((await db.query('select public.current_org() as org')).rows).toEqual([{ org: null }]);
    expect((await db.query("select public.has_permission('access.manage') as allowed")).rows)
      .toEqual([{ allowed: false }]);
    expect((await db.query('select * from public.organizations')).rows).toEqual([]);
    await db.exec('reset role');
    await db.query(
      'select public.set_platform_organization_suspended($1,$2,$3,$4)',
      [gateActor, tenantId, false, 'Access restored'],
    );
    expect((await db.query(
      'select status,signup_enabled from public.organizations where id=$1',
      [tenantId],
    )).rows).toEqual([{ status: 'active', signup_enabled: false }]);
  } finally {
    await db.close();
  }
});
