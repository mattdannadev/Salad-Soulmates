import { describe, expect, it } from 'vitest';
import type { PurchaseDraft, PurchaseLine } from '@/domain/purchasing';
import {
  parsePurchasingDirectoryQuery, selectPurchaseDrafts,
} from '@/app/app/purchasing/directory-query';

const supplierId = '11111111-1111-4111-8111-111111111111';
const otherSupplierId = '22222222-2222-4222-8222-222222222222';

function draft(id: string, supplier: string, status: PurchaseDraft['status']): PurchaseDraft {
  return {
    id,
    supplier_id: supplier,
    material_plan_id: null,
    expected_on: '2026-10-01',
    status,
    reference: 'EXT-1',
    note: '',
    total_cost: null,
    placed_on: null,
    revision: 1,
    created_at: '2026-09-01T00:00:00Z',
  };
}

describe('purchasing directory', () => {
  it('validates filters independently of contextual supplier and plan links', () => {
    const query = parsePurchasingDirectoryQuery({
      supplier: otherSupplierId,
      supplierFilter: supplierId,
      status: 'Confirmed',
      delivery: 'unreceived',
      page: '2',
    }, [supplierId], [], [], []);
    expect(query).toMatchObject({
      supplierFilter: supplierId, status: 'Confirmed', delivery: 'unreceived', page: 2,
    });
    expect(parsePurchasingDirectoryQuery(
      {
        supplierFilter: 'bad', status: 'Ordered', delivery: 'received', page: '0',
      },
      [supplierId],
      [],
      [],
      [],
    ))
      .toMatchObject({
        supplierFilter: undefined, status: undefined, delivery: undefined, page: 1,
      });
    expect(parsePurchasingDirectoryQuery({ delivery: ['unreceived', 'unreceived'] }, [], [], [], []).delivery).toBeUndefined();
  });

  it('filters saved purchases without changing the source drafts', () => {
    const drafts = [
      draft('33333333-3333-4333-8333-333333333333', supplierId, 'Draft'),
      draft('44444444-4444-4444-8444-444444444444', otherSupplierId, 'Confirmed'),
    ];
    const query = parsePurchasingDirectoryQuery(
      { status: 'Confirmed', q: 'Pine' },
      [supplierId, otherSupplierId],
      [],
      [],
      ['2026-10-01'],
    );
    expect(selectPurchaseDrafts(
      drafts,
      [],
      [],
      query,
      new Map([[supplierId, 'Oak'], [otherSupplierId, 'Pine']]),
      new Map(),
      new Map(),
      'en',
    ).map((item) => item.id)).toEqual([drafts[1]?.id]);
    expect(drafts).toHaveLength(2);
  });

  it('matches the dashboard incoming queue across partial and complete receipts', () => {
    const drafts = [
      draft('33333333-3333-4333-8333-333333333333', supplierId, 'Confirmed'),
      draft('44444444-4444-4444-8444-444444444444', supplierId, 'Confirmed'),
      draft('55555555-5555-4555-8555-555555555555', supplierId, 'Confirmed'),
      draft('66666666-6666-4666-8666-666666666666', supplierId, 'Draft'),
    ];
    const lines: PurchaseLine[] = drafts.map((purchase, index) => ({
      id: `77777777-7777-4777-8777-77777777777${index}`,
      purchase_draft_id: purchase.id,
      ingredient_id: '88888888-8888-4888-8888-888888888888',
      supplier_item_id: '99999999-9999-4999-8999-999999999999',
      ingredient_name: 'Garlic',
      supplier_sku: 'G1',
      uom: 'lb',
      purchase_uom: 'case',
      pack_quantity: 10,
      raw_shortage: 10,
      recommended_units: 1,
      purchase_units: 1,
      quantity: 10,
      override_reason: '',
    }));
    const receipts = [
      { purchase_draft_line_id: lines[1]?.id ?? '', quantity: 4 },
      { purchase_draft_line_id: lines[2]?.id ?? '', quantity: 10 },
    ];
    const query = parsePurchasingDirectoryQuery({ delivery: 'unreceived' }, [supplierId], [], [], ['2026-10-01']);
    expect(selectPurchaseDrafts(
      drafts,
      lines,
      receipts,
      query,
      new Map([[supplierId, 'Oak']]),
      new Map(),
      new Map(),
      'en',
    ).map((item) => item.id)).toEqual([drafts[0]?.id, drafts[1]?.id]);
  });
});
