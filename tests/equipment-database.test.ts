import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  afterAll, beforeAll, describe, expect, it,
} from 'vitest';
import { equipmentTreeNodeSchema } from '@/domain/equipment';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const otherActor = id(50);
const primaryTank = id(100);
const childMixer = id(101);
let database: PGlite;

async function query(sql: string, parameters: unknown[] = []) {
  return database.query(sql, parameters);
}

async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
}

describe('equipment registry foundation', () => {
  beforeAll(async () => {
    database = new PGlite();
    await initializeGateDatabase((sql) => database.exec(sql));
    await database.exec(`
      insert into auth.users(id,email) values('${otherActor}','equipment-other@example.test');
      insert into public.facilities(id,organization_id,name)
        values('${id(12)}','${id(10)}','Other equipment facility');
      insert into public.profiles(
        id,organization_id,facility_id,display_name,role,access_profile_id
      ) select '${otherActor}','${id(10)}','${id(12)}','Other equipment admin',
          'admin',id
        from public.access_profiles
        where organization_id='${id(10)}' and name='Administrator';
    `);
  }, 60000);

  afterAll(async () => {
    await database.close();
  });

  it('stores each serialized piece independently and reads a recursive facility tree', async () => {
    await actAs(gateActor);
    await query(`insert into public.equipment(
      id,equipment_code,display_name,equipment_type,manufacturer,model,serial_number,
      location,commissioned_on,usable_capacity,usable_capacity_uom
    ) values($1,$2,$3,'tank',$4,$5,$6,$7,$8,$9,$10)`, [
      primaryTank, 'tank-001', 'Primary holding tank', 'Synthetic Fabrication',
      'T-500', 'TANK-SERIAL-1', 'Mix room', '2026-09-01', 500, 'gal',
    ]);
    await query(`insert into public.equipment(
      id,parent_equipment_id,equipment_code,display_name,equipment_type,manufacturer,
      model,serial_number,location,commissioned_on,usable_capacity,usable_capacity_uom
    ) values($1,$2,$3,$4,'mixer',$5,$6,$7,$8,$9,$10,$11)`, [
      childMixer, primaryTank, 'MIX-001', 'Tank mixer', 'Synthetic Fabrication',
      'MX-50', 'MIXER-SERIAL-1', 'Mix room', '2026-09-01', 50, 'gal',
    ]);

    const treeRows = z.array(z.object({ equipment: z.unknown() })).parse(
      (await query('select to_jsonb(tree) equipment from public.equipment_tree() tree')).rows,
    );
    const rows = z.array(equipmentTreeNodeSchema).parse(
      treeRows.map((row) => row.equipment),
    );
    expect(rows.map((row) => ({
      code: row.equipment_code,
      parent: row.parent_equipment_id,
      depth: row.depth,
    }))).toEqual([
      { code: 'TANK-001', parent: null, depth: 0 },
      { code: 'MIX-001', parent: primaryTank, depth: 1 },
    ]);
    expect((await query(`select count(*)::int count from public.audit_events
      where entity_type='equipment' and entity_id in ($1,$2)`, [primaryTank, childMixer])).rows)
      .toEqual([{ count: 2 }]);
  });

  it('rejects cross-facility parents, cycles, identity rewrites, and arbitrary attributes', async () => {
    await actAs(otherActor);
    await expect(query(`insert into public.equipment(
      parent_equipment_id,equipment_code,display_name,equipment_type
    ) values($1,'PUMP-OTHER','Invalid child','pump')`, [primaryTank]))
      .rejects.toThrow();

    await actAs(gateActor);
    await expect(query(`update public.equipment
      set parent_equipment_id=$1,revision=revision+1 where id=$2`, [childMixer, primaryTank]))
      .rejects.toThrow('cycle');
    await expect(query(`update public.equipment
      set equipment_code='REWRITTEN',revision=revision+1 where id=$1`, [primaryTank]))
      .rejects.toThrow('identity is immutable');
    await database.exec('reset role');
    await expect(query('delete from public.equipment where id=$1', [childMixer]))
      .rejects.toThrow('cannot be deleted');
    await actAs(gateActor);

    expect((await query(`select column_name from information_schema.columns
      where table_schema='public' and table_name='equipment'
        and column_name in ('attributes','metadata','properties')`)).rows).toEqual([]);
  });

  it('enforces capacity, retirement, audit revisions, and facility-scoped invoker reads', async () => {
    await actAs(gateActor);
    await expect(query(`insert into public.equipment(
      equipment_code,display_name,equipment_type,usable_capacity,usable_capacity_uom
    ) values('MIX-NO-CAPACITY','Invalid mixer','mixer',null,null)`)).rejects.toThrow();
    await expect(query(`insert into public.equipment(
      equipment_code,display_name,equipment_type,usable_capacity,usable_capacity_uom
    ) values('PUMP-CAPACITY','Invalid pump','pump',10,'gal')`)).rejects.toThrow();
    await expect(query(`update public.equipment
      set status='retired',revision=revision+1 where id=$1`, [childMixer])).rejects.toThrow();

    await query(`update public.equipment set status='out_of_service',location='Repair bay',
      revision=revision+1 where id=$1`, [childMixer]);
    expect((await query('select revision,status,location from public.equipment where id=$1', [
      childMixer,
    ])).rows).toEqual([{ revision: 2, status: 'out_of_service', location: 'Repair bay' }]);
    expect((await query(`select count(*)::int count from public.audit_events
      where entity_type='equipment' and entity_id=$1`, [childMixer])).rows)
      .toEqual([{ count: 2 }]);

    await actAs(otherActor);
    expect((await query('select * from public.equipment_tree($1)', [id(11)])).rows).toEqual([]);
    expect((await query('select count(*)::int count from public.equipment')).rows)
      .toEqual([{ count: 0 }]);
    expect((await query(`select p.prosecdef as security_definer
      from pg_proc p join pg_namespace n on n.oid=p.pronamespace
      where n.nspname='public' and p.proname='equipment_tree'`)).rows)
      .toEqual([{ security_definer: false }]);
    await expect(database.exec('set role anon; select * from public.equipment;'))
      .rejects.toThrow('permission denied');
  });
});
