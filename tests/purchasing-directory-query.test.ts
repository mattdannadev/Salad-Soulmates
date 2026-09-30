import { describe, expect, it } from 'vitest';
import type { PurchaseDraft } from '@/domain/purchasing';
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
      page: '2',
    }, [supplierId], [], [], []);
    expect(query).toMatchObject({ supplierFilter: supplierId, status: 'Confirmed', page: 2 });
    expect(parsePurchasingDirectoryQuery(
      { supplierFilter: 'bad', status: 'Ordered', page: '0' },
      [supplierId],
      [],
      [],
      [],
    ))
      .toMatchObject({ supplierFilter: undefined, status: undefined, page: 1 });
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
      query,
      new Map([[supplierId, 'Oak'], [otherSupplierId, 'Pine']]),
      new Map(),
      new Map(),
      'en',
    ).map((item) => item.id)).toEqual([drafts[1]?.id]);
    expect(drafts).toHaveLength(2);
  });
});
