import { PGlite } from '@electric-sql/pglite';
import { z } from 'zod';
import {
  afterAll, afterEach, beforeAll, beforeEach, describe, expect, it,
} from 'vitest';
import { gateActor, initializeGateDatabase } from './integration/postgres-bootstrap';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
let database: PGlite;

async function query(sql: string, parameters: unknown[] = []) {
  await database.exec('savepoint expected_failure');
  try {
    const result = await database.query(sql, parameters);
    await database.exec('release savepoint expected_failure');
    return result;
  } catch (error) {
    await database.exec('rollback to savepoint expected_failure; release savepoint expected_failure');
    throw error;
  }
}

async function actAs(actor: string) {
  await database.exec('reset role');
  await database.query("select set_config('request.jwt.claim.sub',$1,false)", [actor]);
  await database.exec('set role authenticated');
}

async function rpc(name: 'create_purchase_draft' | 'post_inventory_receipt' | 'receive_purchase_delivery', payload: unknown) {
  return query(`select public.${name}($1::jsonb) as id`, [JSON.stringify(payload)]);
}

async function createConfirmedPurchase(
  draftId: string,
  ingredientId: string,
  supplierItemId: string,
  supplierId = id(200),
) {
  await rpc('create_purchase_draft', {
    id: draftId,
    kind: 'standalone',
    material_plan_id: null,
    supplier_id: supplierId,
    expected_on: '2026-09-30',
    lines: [{
      ingredient_id: ingredientId,
      supplier_item_id: supplierItemId,
      purchase_units: 1,
      override_reason: 'Test replenishment',
    }],
  });
  const result = await query('select id from public.purchase_draft_lines where purchase_draft_id=$1', [draftId]);
  return z.object({ id: z.uuid() }).parse(result.rows[0]).id;
}

async function delivery() {
  const firstLineId = await createConfirmedPurchase(id(300), id(100), id(201));
  const secondLineId = await createConfirmedPurchase(id(301), id(101), id(202));
  return {
    request_id: id(500),
    supplier_id: id(200),
    received_on: '2026-09-30',
    supplier_reference: 'DELIVERY-500',
    note: 'One truck, two purchase orders',
    lines: [
      {
        id: id(501),
        purchase_draft_line_id: firstLineId,
        quantity: 8,
        supplier_lot: 'EXACT LOT A ',
        expiration_date: '2099-10-01',
        packages: [
          { quantity: 5, supplier_barcode: 'SUPPLIER-501-A' },
          { quantity: 3, supplier_barcode: '' },
        ],
      },
      {
        id: id(502),
        purchase_draft_line_id: firstLineId,
        quantity: 7,
        supplier_lot: '',
        expiration_date: '',
        packages: [{ quantity: 7, supplier_barcode: '' }],
      },
      {
        id: id(503),
        purchase_draft_line_id: secondLineId,
        quantity: 10,
        supplier_lot: 'LOT-B',
        expiration_date: '2099-11-01',
        packages: [
          { quantity: 4, supplier_barcode: '' },
          { quantity: 6, supplier_barcode: 'SUPPLIER-503-B' },
        ],
      },
    ],
  };
}

beforeAll(async () => {
  database = new PGlite();
  await initializeGateDatabase((sql) => database.exec(sql));
  await database.exec(`
    insert into auth.users values('${id(2)}'),('${id(3)}'),('${id(4)}');
    insert into public.facilities(id,organization_id,name)
      values('${id(12)}','${id(10)}','Other facility');
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(2)}','${id(10)}','${id(11)}','Reviewer','reviewer',id
      from public.access_profiles where name='Operations Reviewer';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(3)}','${id(10)}','${id(11)}','Receiver','receiver',id
      from public.access_profiles where name='Receiver';
    insert into public.profiles(id,organization_id,facility_id,display_name,role,access_profile_id)
      select '${id(4)}','${id(10)}','${id(12)}','Other admin','admin',id
      from public.access_profiles where name='Administrator';
  `);
  await actAs(gateActor);
  await database.exec(`
    insert into public.ingredients(id,name,default_uom)
      values('${id(100)}','First ingredient','lb'),('${id(101)}','Second ingredient','lb');
    insert into public.suppliers(id,name)
      values('${id(200)}','Multi-PO supplier'),('${id(210)}','Other supplier');
    insert into public.supplier_items(
      id,supplier_id,ingredient_id,supplier_sku,purchase_uom,pack_quantity,pack_quantity_uom)
    values
      ('${id(201)}','${id(200)}','${id(100)}','ORIGINAL-A','pail',20,'lb'),
      ('${id(202)}','${id(200)}','${id(101)}','ORIGINAL-B','case',15,'lb'),
      ('${id(211)}','${id(210)}','${id(100)}','OTHER-A','pail',20,'lb');
  `);
}, 60000);

beforeEach(async () => {
  await database.exec('begin');
  await actAs(gateActor);
});

afterEach(async () => {
  await database.exec('rollback');
});

afterAll(async () => {
  await database.close();
});

describe('multi-purchase-order receiving', () => {
  it('atomically posts one header with split lots, PO snapshots, ledger events, and complete labels', async () => {
    const payload = await delivery();
    await query("update public.supplier_items set supplier_sku='CHANGED',pack_quantity=99 where id=$1", [id(201)]);
    const result = await rpc('receive_purchase_delivery', payload);
    const receiptId = z.object({ id: z.uuid() }).parse(result.rows[0]).id;

    expect((await query('select id from public.inventory_receipts where id=$1', [receiptId])).rows).toHaveLength(1);
    expect((await query('select id from public.inventory_receipt_lines where receipt_id=$1', [receiptId])).rows).toHaveLength(3);
    expect((await query(`select event.request_id from public.inventory_events event
      join public.inventory_receipt_lines line on line.id=event.receipt_line_id
      where line.receipt_id=$1`, [receiptId])).rows).toHaveLength(3);
    expect((await query(`select unit.id from public.serialized_units unit
      join public.receipt_serializations serialization on serialization.id=unit.serialization_id
      join public.inventory_receipt_lines line on line.id=serialization.receipt_line_id
      where line.receipt_id=$1`, [receiptId])).rows).toHaveLength(5);
    expect((await query(`select line.supplier_lot,line.assigned_source_lot,line.source_lot_origin,
        serialization.supplier_item_snapshot->>'supplier_sku' supplier_sku,
        serialization.supplier_item_snapshot->>'pack_quantity' pack_quantity
      from public.inventory_receipt_lines line join public.receipt_serializations serialization
        on serialization.receipt_line_id=line.id where line.receipt_id=$1 order by line.id`, [receiptId])).rows)
      .toEqual([
        {
          supplier_lot: 'EXACT LOT A ',
          assigned_source_lot: null,
          source_lot_origin: 'supplier_provided',
          supplier_sku: 'ORIGINAL-A',
          pack_quantity: '20.0000',
        },
        {
          supplier_lot: '',
          assigned_source_lot: 'SL-26273-0001',
          source_lot_origin: 'salad_soulmates_assigned',
          supplier_sku: 'ORIGINAL-A',
          pack_quantity: '20.0000',
        },
        {
          supplier_lot: 'LOT-B',
          assigned_source_lot: null,
          source_lot_origin: 'supplier_provided',
          supplier_sku: 'ORIGINAL-B',
          pack_quantity: '15.0000',
        },
      ]);
  });

  it('returns the same receipt for a canonical retry and rejects changed values', async () => {
    const payload = await delivery();
    const first = await rpc('receive_purchase_delivery', payload);
    const retry = await rpc('receive_purchase_delivery', { ...payload, lines: [...payload.lines].reverse() });
    expect(retry.rows).toEqual(first.rows);
    await expect(rpc('receive_purchase_delivery', {
      ...payload,
      lines: payload.lines.map((line, index) => (index === 0 ? { ...line, supplier_lot: 'CHANGED' } : line)),
    })).rejects.toThrow('Request ID already used with different values');
    expect((await query('select id from public.inventory_receipts where delivery_request_id=$1', [payload.request_id])).rows)
      .toHaveLength(1);
  });

  it('rejects aggregate over-receipt across lot splits without partial records', async () => {
    const payload = await delivery();
    const overReceipt = {
      ...payload,
      lines: payload.lines.slice(0, 2).map((line) => ({
        ...line,
        quantity: 11,
        packages: [{ quantity: 11, supplier_barcode: '' }],
      })),
    };
    await expect(rpc('receive_purchase_delivery', overReceipt))
      .rejects.toThrow('outstanding inbound quantity');
    expect((await query('select id from public.inventory_receipts where delivery_request_id=$1', [payload.request_id])).rows)
      .toHaveLength(0);
  });

  it('aggregates existing partial receipts and requested lot splits exactly once', async () => {
    const payload = await delivery();
    const firstPayloadLine = payload.lines[0];
    if (!firstPayloadLine) throw new Error('Expected the first delivery line fixture.');
    const purchaseLineId = firstPayloadLine.purchase_draft_line_id;
    const partialReceipt = (offset: number) => rpc('post_inventory_receipt', {
      request_id: id(550 + offset),
      supplier_id: id(200),
      ingredient_id: id(100),
      quantity: 2,
      uom: 'lb',
      received_on: '2026-09-30',
      supplier_reference: 'EARLIER-PARTIAL',
      supplier_lot: `EARLIER-${offset}`,
      expiration_date: '',
      note: '',
      purchase_draft_line_id: purchaseLineId,
    });
    await partialReceipt(0);
    await partialReceipt(1);
    await rpc('receive_purchase_delivery', {
      ...payload,
      lines: payload.lines.map((line) => (
        line.purchase_draft_line_id === purchaseLineId
          ? { ...line, quantity: 8, packages: [{ quantity: 8, supplier_barcode: '' }] }
          : line
      )),
    });
    const total = await query(`select sum(quantity) total from public.inventory_receipt_lines
      where purchase_draft_line_id=$1`, [purchaseLineId]);
    expect(total.rows).toEqual([{ total: '20.0000' }]);
  });

  it('enforces the complete-delivery package cap and finite four-decimal quantities', async () => {
    const payload = await delivery();
    const tooManyPackages = payload.lines.slice(0, 2).map((line) => ({
      ...line,
      quantity: 10.1,
      packages: Array.from({ length: 101 }, () => ({ quantity: 0.1, supplier_barcode: '' })),
    }));
    await expect(rpc('receive_purchase_delivery', { ...payload, lines: tooManyPackages }))
      .rejects.toThrow('no more than 200 packages');
    await expect(rpc('receive_purchase_delivery', {
      ...payload,
      lines: [{ ...payload.lines[0], quantity: 'NaN' }],
    })).rejects.toThrow('positive with at most four decimal places');
    await expect(rpc('receive_purchase_delivery', {
      ...payload,
      lines: [{ ...payload.lines[0], packages: [{ quantity: 7, supplier_barcode: '' }] }],
    })).rejects.toThrow('Package quantities must equal');
    expect((await query('select id from public.inventory_receipts where delivery_request_id=$1', [payload.request_id])).rows)
      .toHaveLength(0);
  });

  it('enforces permission, facility, supplier, and active-pack boundaries', async () => {
    const payload = await delivery();
    await actAs(id(2));
    await expect(rpc('receive_purchase_delivery', payload)).rejects.toThrow('Receiving permission required');
    await actAs(id(4));
    await expect(rpc('receive_purchase_delivery', payload)).rejects.toThrow();
    await actAs(gateActor);

    const otherSupplierLineId = await createConfirmedPurchase(id(302), id(100), id(211), id(210));
    await expect(rpc('receive_purchase_delivery', {
      ...payload,
      lines: [...payload.lines, {
        id: id(504),
        purchase_draft_line_id: otherSupplierLineId,
        quantity: 1,
        supplier_lot: 'OTHER-SUPPLIER',
        expiration_date: '',
        packages: [{ quantity: 1, supplier_barcode: '' }],
      }],
    })).rejects.toThrow('one active supplier');

    await query('update public.supplier_items set active=false where id=$1', [id(201)]);
    await expect(rpc('receive_purchase_delivery', payload))
      .rejects.toThrow('one active supplier');
  });

  it('allows an authorized receiver to post the PO-derived ingredient and unit', async () => {
    const payload = await delivery();
    await actAs(id(3));
    const result = await rpc('receive_purchase_delivery', payload);
    const receiptId = z.object({ id: z.uuid() }).parse(result.rows[0]).id;
    expect((await query(`select ingredient_id,uom from public.inventory_receipt_lines
      where receipt_id=$1 order by id`, [receiptId])).rows).toEqual([
      { ingredient_id: id(100), uom: 'lb' },
      { ingredient_id: id(100), uom: 'lb' },
      { ingredient_id: id(101), uom: 'lb' },
    ]);
  });

  it('rejects a directly inserted idempotency header without its complete graph', async () => {
    const canonical = {
      request_id: id(580),
      supplier_id: id(200),
      received_on: '2026-09-30',
      supplier_reference: '',
      note: '',
      lines: [{
        id: id(581),
        purchase_draft_line_id: id(582),
        quantity: 1,
        supplier_lot: '',
        expiration_date: null,
        packages: [{ quantity: 1, supplier_barcode: '' }],
      }],
    };
    await database.exec('savepoint incomplete_header');
    let failure: unknown;
    try {
      await database.query(`insert into public.inventory_receipts(
        id,supplier_id,received_on,delivery_request_id,delivery_payload,delivery_line_count)
        values($1,$2,$3,$4,$5::jsonb,1)`, [
        id(583), id(200), '2026-09-30', id(580), JSON.stringify(canonical),
      ]);
      await database.exec('set constraints public.purchase_delivery_complete_check immediate');
    } catch (error) {
      failure = error;
    }
    await database.exec('rollback to savepoint incomplete_header; release savepoint incomplete_header');
    expect(String(failure)).toContain('complete immutable receipt');
    expect((await query('select id from public.inventory_receipts where id=$1', [id(583)])).rows)
      .toHaveLength(0);

    const oversized = {
      ...canonical,
      request_id: id(584),
      lines: [{
        ...canonical.lines[0],
        id: id(585),
        quantity: 20.1,
        packages: Array.from({ length: 201 }, () => ({ quantity: 0.1, supplier_barcode: '' })),
      }],
    };
    await database.exec('savepoint oversized_header');
    failure = undefined;
    try {
      await database.query(`insert into public.inventory_receipts(
        id,supplier_id,received_on,delivery_request_id,delivery_payload,delivery_line_count)
        values($1,$2,$3,$4,$5::jsonb,1)`, [
        id(586), id(200), '2026-09-30', id(584), JSON.stringify(oversized),
      ]);
      await database.exec('set constraints public.purchase_delivery_complete_check immediate');
    } catch (error) {
      failure = error;
    }
    await database.exec('rollback to savepoint oversized_header; release savepoint oversized_header');
    expect(String(failure)).toContain('more than 200 packages');
  });

  it('prevents direct lines from extending a committed multi-line receipt', async () => {
    const payload = await delivery();
    const result = await rpc('receive_purchase_delivery', payload);
    const receiptId = z.object({ id: z.uuid() }).parse(result.rows[0]).id;
    await expect(query(`insert into public.inventory_receipt_lines(
      id,receipt_id,ingredient_id,quantity,uom,supplier_lot,assigned_source_lot,
      source_lot_origin,expiration_date,purchase_draft_line_id)
      select $1,$2,ingredient_id,quantity,uom,supplier_lot,assigned_source_lot,
        source_lot_origin,expiration_date,purchase_draft_line_id
      from public.inventory_receipt_lines where id=$3`, [id(599), receiptId, id(501)]))
      .rejects.toThrow('Committed purchase delivery lines are immutable');
  });
});
