import { PGlite } from '@electric-sql/pglite';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;

async function actAs(actor: string | null) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor ?? '']);
  await database.exec('set role authenticated');
}

async function visibleIds(table: 'ingredients' | 'inventory_events') {
  const result = await database.query<{ id: string }>(`select id from public.${table} order by id`);
  return result.rows.map((row) => row.id);
}

beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await database.exec('reset role');
  await database.exec(`
    insert into auth.users(id,email) values
      ('${id(2)}','worker@example.test'),
      ('${id(3)}','outside@example.test'),
      ('${id(4)}','other-facility@example.test');
    insert into public.facilities(id,organization_id,name)
      values('${id(12)}','${id(10)}','Other facility');
    insert into public.organizations(id,name,slug)
      values('${id(20)}','Outside organization','outside-rls-test');
    insert into public.facilities(id,organization_id,name)
      values('${id(21)}','${id(20)}','Outside facility');
    insert into public.access_profiles(id,organization_id,name,base_role,is_system)
      values('${id(22)}','${id(20)}','Outside administrator','admin',true);
    insert into public.access_profile_permissions(organization_id,access_profile_id,permission_code)
      values('${id(20)}','${id(22)}','master_data.read'),
            ('${id(20)}','${id(22)}','inventory.read'),
            ('${id(20)}','${id(22)}','inventory.adjust');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(2)}','${id(10)}','${id(11)}','Worker','worker',id
      from public.access_profiles where organization_id='${id(10)}' and name='Production Worker';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      values('${id(3)}','${id(20)}','${id(21)}','Outside','admin','${id(22)}');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(4)}','${id(10)}','${id(12)}','Other facility','admin',id
      from public.access_profiles where organization_id='${id(10)}' and name='Administrator';
  `);

  await actAs(gateActor);
  await database.exec(`
    insert into public.ingredients(id,name,default_uom)
      values('${id(100)}','Fixture garlic','lb');
    insert into public.inventory_events(id,ingredient_id,event_type,quantity_delta,uom,reason_note,request_id)
      values('${id(200)}','${id(100)}','OpeningBalance',10,'lb','Fixture balance','${id(300)}');
  `);
  await actAs(id(4));
  await database.exec(`
    insert into public.inventory_events(id,ingredient_id,event_type,quantity_delta,uom,reason_note,request_id)
      values('${id(201)}','${id(100)}','OpeningBalance',20,'lb','Other facility balance','${id(301)}');
  `);
  await actAs(id(3));
  await database.exec('reset role');
  await database.exec(`
    insert into public.ingredients(id,organization_id,name,default_uom)
      values('${id(101)}','${id(20)}','Outside garlic','lb');
    insert into public.inventory_events(id,organization_id,facility_id,ingredient_id,event_type,quantity_delta,uom,reason_note,created_by,request_id)
      values('${id(202)}','${id(20)}','${id(21)}','${id(101)}','OpeningBalance',30,'lb','Outside balance','${id(3)}','${id(302)}');
  `);
}, 60000);

afterAll(async () => {
  await database?.close();
});

describe('Operations Copilot ingredient and inventory read boundaries', () => {
  it('denies anonymous direct table reads at the grant boundary', async () => {
    await database.exec('reset role; set role anon');
    await expect(visibleIds('ingredients')).rejects.toThrow('permission denied');
    await expect(visibleIds('inventory_events')).rejects.toThrow('permission denied');
  });

  it('returns no rows for an authenticated role without a JWT identity', async () => {
    await actAs(null);
    expect(await visibleIds('ingredients')).toEqual([]);
    expect(await visibleIds('inventory_events')).toEqual([]);
  });

  it('returns no rows when the profile lacks both read permissions', async () => {
    await actAs(id(2));
    expect(await visibleIds('ingredients')).toEqual([]);
    expect(await visibleIds('inventory_events')).toEqual([]);
  });

  it('keeps ingredients within the organization and ledger rows within the current facility', async () => {
    await actAs(gateActor);
    expect(await visibleIds('ingredients')).toEqual([id(100)]);
    expect(await visibleIds('inventory_events')).toEqual([id(200)]);

    await actAs(id(4));
    expect(await visibleIds('ingredients')).toEqual([id(100)]);
    expect(await visibleIds('inventory_events')).toEqual([id(201)]);

    await actAs(id(3));
    expect(await visibleIds('ingredients')).toEqual([id(101)]);
    expect(await visibleIds('inventory_events')).toEqual([id(202)]);
  });

  it('hides both tables when an otherwise authorized profile becomes inactive', async () => {
    await database.exec('reset role');
    await database.query('update public.profiles set active=false where id=$1', [id(4)]);
    await actAs(id(4));
    expect(await visibleIds('ingredients')).toEqual([]);
    expect(await visibleIds('inventory_events')).toEqual([]);
  });
});
