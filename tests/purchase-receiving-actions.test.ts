import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import receivePurchaseDelivery from '@/app/purchase-receiving-actions';

const mocks = vi.hoisted(() => ({
  profile: vi.fn(),
  permission: vi.fn(),
  rpc: vi.fn(),
  from: vi.fn(),
  revalidate: vi.fn(),
  log: vi.fn(),
}));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireProfile: mocks.profile }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/operation-error', () => ({ logFailure: mocks.log }));
vi.mock('next/cache', () => ({ revalidatePath: mocks.revalidate }));

const id = (value: number) => (
  `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`
);
const input = {
  request_id: id(1),
  supplier_id: id(2),
  received_on: '2026-09-21',
  supplier_reference: 'DELIVERY-1',
  note: '',
  lines: [{
    id: id(3),
    purchase_draft_line_id: id(4),
    quantity: 5,
    supplier_lot: 'LOT-1',
    expiration_date: null,
    packages: [{ quantity: 5, supplier_barcode: '' }],
  }],
};

function reconciliationQuery(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(),
    eq: vi.fn(),
    maybeSingle: vi.fn().mockResolvedValue({ data, error }),
  };
  query.select.mockReturnValue(query);
  query.eq.mockReturnValue(query);
  mocks.from.mockReturnValue(query);
  return query;
}

describe('purchase receiving action', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.profile.mockResolvedValue({
      db: { rpc: mocks.rpc, from: mocks.from },
      profile: { id: id(9) },
    });
    mocks.permission.mockResolvedValue(true);
    mocks.rpc.mockResolvedValue({ data: id(20), error: null });
  });

  it('validates before access and posts the exact delivery contract', async () => {
    expect(await receivePurchaseDelivery({})).toMatchObject({ retry: 'new_request' });
    expect(mocks.profile).not.toHaveBeenCalled();
    expect(await receivePurchaseDelivery(input)).toMatchObject({ ok: true, id: id(20) });
    expect(mocks.rpc).toHaveBeenCalledWith('receive_purchase_delivery', { payload: input });
    expect(mocks.revalidate).toHaveBeenCalledWith('/app');
    expect(mocks.revalidate).toHaveBeenCalledWith('/app/traceability');
    expect(mocks.revalidate).toHaveBeenCalledWith('/receiving/packages/[id]', 'page');
  });

  it('allows correction with a new token after authoritative validation failures', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: {
        code: 'P0001',
        message: 'Select confirmed inbound from one active supplier in this facility',
      },
    });
    expect(await receivePurchaseDelivery(input)).toMatchObject({
      ok: false,
      retry: 'new_request',
    });
  });

  it('preserves the same token for ambiguous failures and malformed acknowledgements', async () => {
    mocks.rpc.mockRejectedValueOnce(new Error('Connection lost'));
    expect(await receivePurchaseDelivery(input)).toMatchObject({ retry: 'same_request' });
    mocks.rpc.mockResolvedValueOnce({ data: true, error: null });
    expect(await receivePurchaseDelivery(input)).toMatchObject({ retry: 'same_request' });
  });

  it('routes conflicting request tokens to the existing receipt for reconciliation', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Request ID already used with different values' },
    });
    const query = reconciliationQuery({ id: id(20) });
    expect(await receivePurchaseDelivery(input)).toMatchObject({
      ok: false,
      retry: 'review_existing',
      id: id(20),
    });
    expect(mocks.from).toHaveBeenCalledWith('inventory_receipts');
    expect(query.eq).toHaveBeenCalledWith('delivery_request_id', input.request_id);
    expect(query.eq).toHaveBeenCalledWith('created_by', id(9));
  });

  it('keeps retry identity when reconciliation lookup is unavailable', async () => {
    mocks.rpc.mockResolvedValue({
      data: null,
      error: { code: 'P0001', message: 'Request ID already used with different values' },
    });
    reconciliationQuery(null, { code: 'CONNECTION', message: 'Lookup failed' });
    expect(await receivePurchaseDelivery(input)).toMatchObject({ retry: 'same_request' });
  });
});
