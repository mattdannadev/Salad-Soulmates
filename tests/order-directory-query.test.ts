import { describe, expect, it } from 'vitest';
import {
  orderDetailHref,
  orderDirectoryHref,
  parseOrderDirectoryQuery,
} from '../src/app/app/orders/directory-query';

const customerId = '70a28c28-a824-4fb3-8127-30d4fe72ca6c';
const orderId = '2c46ba69-d71c-4563-b07a-fc59646f40db';
const customers = [customerId];
const products = ['House Salad'];

describe('order directory query', () => {
  it('accepts supported customer, product, production, historical, sort, and page criteria', () => {
    const parsed = parseOrderDirectoryQuery(
      {
        q: '  greens  ',
        customerFilter: customerId,
        product: 'House Salad',
        status: 'draft',
        view: 'historical',
        sort: 'pickup-oldest',
        page: '3',
      },
      customers,
      products,
    );
    expect(parsed).toEqual({
      q: 'greens',
      customerFilter: customerId,
      product: 'House Salad',
      status: 'draft',
      view: 'historical',
      sort: 'pickup-oldest',
      page: 3,
    });
    expect(orderDirectoryHref(parsed)).toBe(
      `/app/orders?q=greens&customerFilter=${customerId}&product=House+Salad&status=draft&view=historical&sort=pickup-oldest&page=3`,
    );
    expect(orderDetailHref(orderDirectoryHref(parsed), orderId)).toContain(`order=${orderId}`);
  });

  it('discards repeated, unknown, and oversized values, preserving active default', () => {
    expect(
      parseOrderDirectoryQuery(
        {
          q: ['one', 'two'],
          customerFilter: orderId,
          product: 'Unknown',
          status: 'cancelled',
          view: 'all',
          sort: 'bogus',
          page: '1000001',
        },
        customers,
        products,
      ),
    ).toEqual({
      q: '',
      customerFilter: undefined,
      product: undefined,
      status: undefined,
      view: undefined,
      sort: 'pickup-newest',
      page: 1,
    });
    expect(
      orderDirectoryHref(
        parseOrderDirectoryQuery(
          {
            q: 'x'.repeat(201),
            page: '-1',
            customer: customerId,
            draft: orderId,
          },
          customers,
          products,
        ),
      ),
    ).toBe('/app/orders');
  });

  it('keeps order detail links in the current directory view', () => {
    const directory = `/app/orders?view=historical&customerFilter=${customerId}&page=2`;
    expect(orderDetailHref(directory, orderId)).toBe(`${directory}&order=${orderId}`);
  });
});
