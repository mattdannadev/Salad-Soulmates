import { describe, expect, it } from 'vitest';
import type { CustomerOrder } from '@/domain/customer-orders';
import type { MaterialPlan } from '@/domain/purchasing';
import {
  parseShippingDirectoryQuery, selectShippingOrders, shippingDirectoryHref,
  shippingOrderHref,
} from '@/app/app/shipping/directory-query';

const customerId = '11111111-1111-4111-8111-111111111111';
const otherCustomerId = '22222222-2222-4222-8222-222222222222';
const orderId = '33333333-3333-4333-8333-333333333333';
const otherOrderId = '44444444-4444-4444-8444-444444444444';

function order(id: string, customer: string, name: string, date: string): CustomerOrder {
  return {
    id,
    customer_id: customer,
    customer_name: name,
    reference: 'Market',
    needed_on: date,
    products: [{ product_id: '55555555-5555-4555-8555-555555555555', batch_count: 1, customer_product_option_id: null }],
    items: [{
      product_id: '55555555-5555-4555-8555-555555555555',
      batch_count: 1,
      customer_product_option_id: null,
      product_name: 'Green salad',
      recipe_version_id: '66666666-6666-4666-8666-666666666666',
      version_number: 1,
      batch_gallons: 40,
      packaging_label: 'Case',
      unit_name: 'case',
      gallons_per_unit: 1,
      unit_price: null,
      currency: 'USD',
      unit_count: 40,
      line_total: null,
    }],
    created_at: '2026-09-01T00:00:00Z',
  };
}

describe('shipping directory', () => {
  it('validates URL criteria while preserving an order deep link', () => {
    const query = parseShippingDirectoryQuery({
      order: orderId,
      customerFilter: customerId,
      q: '  salad  ',
      status: 'active',
      page: '2',
    }, [customerId], ['2026-10-01']);
    expect(query).toMatchObject({
      q: 'salad', customerFilter: customerId, status: 'active', page: 2,
    });
    expect(shippingOrderHref(shippingDirectoryHref(query), orderId))
      .toContain(`order=${orderId}`);
    expect(parseShippingDirectoryQuery(
      { customerFilter: 'unknown', page: '-1', status: 'fulfilled' },
      [customerId],
      [],
    )).toMatchObject({ customerFilter: undefined, page: 1, status: undefined });
  });

  it('filters on actual order data and keeps cancelled order history visible', () => {
    const orders = [
      order(orderId, customerId, 'Oak', '2026-10-01'),
      order(otherOrderId, otherCustomerId, 'Pine', '2026-10-03'),
    ];
    const plans: MaterialPlan[] = [{
      id: orderId,
      name: 'Oak',
      needed_on: '2026-10-01',
      batches: [],
      requirements: [],
      status: 'Active',
      created_at: '2026-09-01T00:00:00Z',
    }];
    const query = parseShippingDirectoryQuery(
      { status: 'inactive', q: 'Pine' },
      [customerId, otherCustomerId],
      ['2026-10-01', '2026-10-03'],
    );
    expect(selectShippingOrders(orders, plans, query, 'en').map((item) => item.id))
      .toEqual([otherOrderId]);
  });
});
