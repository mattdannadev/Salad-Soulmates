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
      .toEqual([{ count: 30 }]);
    expect((await db.query("select public.has_permission('inventory.receive') as allowed")).rows)
      .toEqual([{ allowed: true }]);
    await expect(db.query('select public.validate_inventory()')).rejects.toThrow('permission denied');
  } finally {
    await db.close();
  }
});
