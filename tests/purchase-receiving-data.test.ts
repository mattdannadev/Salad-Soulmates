import { createClient } from '@supabase/supabase-js';
import {
  afterEach, expect, it, vi,
} from 'vitest';
import loadPurchaseReceivingData from '@/lib/purchase-receiving-data';
import type { Database } from '@/lib/database.types';

vi.mock('server-only', () => ({}));

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const orderCount = 501;

function records(): Record<string, unknown[]> {
  return {
    suppliers: [{
      id: id(1),
      name: 'Pagination supplier',
      contact_name: '',
      email: '',
      phone: '',
      lead_time_days: null,
      active: true,
    }],
    purchase_drafts: Array.from({ length: orderCount }, (_, index) => ({
      id: id(1000 + index),
      material_plan_id: null,
      supplier_id: id(1),
      expected_on: '2026-10-01',
      status: 'Confirmed',
      reference: `PO-${index}`,
      note: '',
      revision: 2,
      created_at: '2026-09-21T12:00:00Z',
    })),
    purchase_draft_lines: Array.from({ length: orderCount }, (_, index) => ({
      id: id(2000 + index),
      purchase_draft_id: id(1000 + index),
      ingredient_id: id(2),
      supplier_item_id: id(3),
      ingredient_name: 'Shared ingredient',
      supplier_sku: 'PACK',
      uom: 'gal',
      purchase_uom: 'pail',
      pack_quantity: 10,
      raw_shortage: 10,
      recommended_units: 1,
      purchase_units: 1,
      quantity: 10,
      override_reason: '',
    })),
    inventory_receipt_lines: Array.from({ length: orderCount }, (_, index) => ({
      id: id(3000 + index),
      receipt_id: id(4000 + index),
      ingredient_id: id(2),
      purchase_draft_line_id: id(2000 + index),
      quantity: 2,
      uom: 'gal',
      supplier_lot: `LOT-${index}`,
      source_lot_origin: 'supplier_provided',
      assigned_source_lot: null,
      expiration_date: null,
    })),
  };
}

/** Exercise the real Supabase range query and persisted-record validators without a server. */
function databaseFixture(failingTable?: string, fixtureRecords = records()) {
  const requestedPages: string[] = [];
  const fetchRecords: typeof fetch = (input) => {
    let address: string;
    if (typeof input === 'string') address = input;
    else if (input instanceof URL) address = input.href;
    else address = input.url;
    const url = new URL(address);
    const table = url.pathname.split('/').at(-1) ?? '';
    const offset = Number(url.searchParams.get('offset') ?? 0);
    const limit = Number(url.searchParams.get('limit') ?? 500);
    requestedPages.push(`${table}:${offset}`);
    const failed = table === failingTable && offset > 0;
    const payload = failed
      ? { code: 'READ_FAILED', message: 'Simulated database failure' }
      : (fixtureRecords[table] ?? []).slice(offset, offset + limit);
    return Promise.resolve(new Response(JSON.stringify(payload), {
      status: failed ? 400 : 200,
      headers: { 'Content-Type': 'application/json' },
    }));
  };
  return {
    requestedPages,
    db: createClient<Database>('http://127.0.0.1:4010', 'disposable-test-key', {
      global: { fetch: fetchRecords },
      auth: { persistSession: false, autoRefreshToken: false },
    }),
  };
}

afterEach(() => vi.restoreAllMocks());

it('includes later-page POs and deducts later-page receipts using the saved unit', async () => {
  const { db, requestedPages } = databaseFixture();
  const result = await loadPurchaseReceivingData(db);
  expect(result.orders).toHaveLength(orderCount);
  expect(result.orders.at(-1)?.lines).toEqual([
    expect.objectContaining({
      ordered: 10, received: 2, outstanding: 8, uom: 'gal',
    }),
  ]);
  expect(requestedPages).toEqual(expect.arrayContaining([
    'purchase_drafts:500',
    'purchase_draft_lines:500',
    'inventory_receipt_lines:500',
  ]));
});

it('fails the workspace instead of treating a failed later receipt page as zero received', async () => {
  const logged = vi.spyOn(console, 'error').mockImplementation(() => undefined);
  const { db } = databaseFixture('inventory_receipt_lines');
  await expect(loadPurchaseReceivingData(db)).rejects.toThrow('Unable to load inventory_receipt_lines.');
  expect(logged).toHaveBeenCalledWith('load_rows', { code: 'READ_FAILED' });
});

it('distinguishes an empty workspace from malformed persisted purchase records', async () => {
  const empty = databaseFixture(undefined, {});
  expect((await loadPurchaseReceivingData(empty.db)).orders).toEqual([]);
  const malformed = databaseFixture(undefined, { purchase_drafts: [{ id: 'invalid' }] });
  await expect(loadPurchaseReceivingData(malformed.db)).rejects.toThrow();
});
