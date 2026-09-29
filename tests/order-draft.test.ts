import {
  afterEach, describe, expect, it, vi,
} from 'vitest';
import {
  clearOrderDraft, orderDraftFromForm, orderDraftSnapshot, parseOrderDraftSnapshot,
  saveOrderDraft,
} from '@/app/app/orders/order-draft';

const draftId = '10000000-0000-4000-8000-000000000001';
const customerId = '20000000-0000-4000-8000-000000000002';
const productId = '30000000-0000-4000-8000-000000000003';
const optionId = '40000000-0000-4000-8000-000000000004';
const store = new Map<string, string>();

afterEach(() => {
  vi.unstubAllGlobals();
  store.clear();
});

function stubStorage() {
  vi.stubGlobal('sessionStorage', {
    setItem: (key: string, value: string) => store.set(key, value),
    getItem: (key: string) => store.get(key) ?? null,
    removeItem: (key: string) => store.delete(key),
  });
}

describe('order detour draft', () => {
  it('keeps only typed order fields in tab storage, with no URL or customer contact data', () => {
    stubStorage();
    const form = new FormData();
    form.set('reference', 'Pickup A');
    form.set('needed_on', '2026-10-01');
    form.set(productId, '3');
    form.set(`${productId}-packaging`, optionId);
    form.set('private_notes', 'never store this');
    const draft = orderDraftFromForm(form, customerId, [{ id: productId }]);
    expect(draft).toEqual({
      customerId,
      reference: 'Pickup A',
      neededOn: '2026-10-01',
      products: [{ id: productId, batches: 3, optionId }],
    });
    expect(draft).not.toBeNull();
    if (!draft) throw new Error('Expected valid draft');
    expect(saveOrderDraft(draftId, draft)).toBe(true);
    expect(orderDraftSnapshot(draftId)).not.toContain('private_notes');
    expect(parseOrderDraftSnapshot(orderDraftSnapshot(draftId))).toEqual(draft);
    clearOrderDraft(draftId);
    expect(orderDraftSnapshot(draftId)).toBe('');
  });

  it('supports a draft before a customer is selected', () => {
    const form = new FormData();
    form.set('reference', 'Pending customer');
    form.set('needed_on', '');
    expect(orderDraftFromForm(form, '', [{ id: productId }])).toEqual({
      customerId: '', reference: 'Pending customer', neededOn: '', products: [],
    });
  });

  it('rejects malformed, excessive, and out-of-range values', () => {
    const form = new FormData();
    form.set('reference', 'Pickup A');
    form.set('needed_on', '2026-10-01');
    form.set(productId, '10001');
    form.set(`${productId}-packaging`, optionId);
    expect(orderDraftFromForm(form, customerId, [{ id: productId }])).toBeNull();
    form.set(productId, '2.5');
    expect(orderDraftFromForm(form, customerId, [{ id: productId }])).toBeNull();
    expect(parseOrderDraftSnapshot('{')).toBeNull();
    expect(parseOrderDraftSnapshot(JSON.stringify({
      customerId, reference: '<script>', neededOn: 'invalid', products: [],
    }))).toBeNull();
    expect(orderDraftSnapshot('unsafe')).toBe('');
  });
});
