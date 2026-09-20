import { PGlite } from '@electric-sql/pglite';
import {
  beforeAll, beforeEach, afterEach, afterAll, expect, it,
} from 'vitest';
import { initializeGateDatabase, gateActor } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let db: PGlite;
const customer = {
  id: id(800),
  revision: 0,
  name: 'Synthetic customer',
  contact_name: 'Test contact',
  email: 'contact@example.test',
  phone: '555-0100',
  address: 'Test address',
  notes: 'Pickup at dock',
};
async function query(sql: string, args: unknown[] = []) {
  await db.exec('savepoint request');
  try {
    const result = await db.query(sql, args);
    await db.exec('release savepoint request');
    return result;
  } catch (error) {
    await db.exec('rollback to savepoint request; release savepoint request');
    throw error;
  }
}
async function save(payload: unknown) {
  return query('select public.save_customer_master($1::jsonb)', [JSON.stringify(payload)]);
}
beforeAll(async () => {
  db = new PGlite();
  await initializeGateDatabase((sql) => db.exec(sql));
  await db.exec(`
    insert into auth.users values('${id(2)}');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
    select '${id(2)}','${id(10)}','${id(11)}','Reviewer','reviewer',id
    from public.access_profiles where name='Operations Reviewer';
    insert into public.organizations(id,name,slug) values('${id(20)}','Other org','other-org');
    insert into public.customers(id,organization_id,name) values('${id(801)}','${id(20)}','Other customer');
  `);
}, 60000);
beforeEach(async () => {
  await db.exec('begin');
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [gateActor]);
  await db.exec('set role authenticated');
});
afterEach(async () => {
  await db.exec('rollback');
});
afterAll(async () => {
  await db.close();
});
it('creates and retries a customer, updates contacts and rejects conflicting stale edits', async () => {
  await save(customer);
  await save(customer);
  const updated = { ...customer, phone: '555-0200' };
  await save(updated);
  await save(updated);
  const result = await query('select phone,revision from public.customers where id=$1', [customer.id]);
  expect(result.rows).toEqual([{ phone: '555-0200', revision: 1 }]);
  await expect(save({ ...customer, phone: '555-0300' })).rejects.toThrow('Customer changed');
  await expect(save({ ...updated, revision: 1, name: 'Rename' })).rejects.toThrow('cannot be changed');
});
it('rejects invalid details and a missing customer with an existing revision', async () => {
  await expect(save({ ...customer, id: 'invalid' })).rejects.toThrow();
  await expect(save({ ...customer, notes: 'a'.repeat(2001) })).rejects.toThrow();
  await expect(save({ ...customer, revision: 5 })).rejects.toThrow('Customer changed');
});
it('keeps customer identity stable and rejects cross-organization updates', async () => {
  await save(customer);
  await expect(query('update public.customers set name=$1 where id=$2', ['Changed', customer.id])).rejects.toThrow();
  await expect(save({ ...customer, id: id(801), name: 'Other customer' })).rejects.toThrow();
  expect((await query('select id from public.customers where id=$1', [id(801)])).rows).toEqual([]);
});
it('denies read-only and anonymous customer writes', async () => {
  await db.query("select set_config('request.jwt.claim.sub',$1,false)", [id(2)]);
  await expect(save(customer)).rejects.toThrow('permission required');
  await db.exec('reset role; set role anon');
  await expect(save(customer)).rejects.toThrow('permission denied');
});
