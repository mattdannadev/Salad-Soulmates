import { describe, expect, it } from 'vitest';
import {
  customerCreateHref, customerDirectoryHref, customerReturnContext, customerReturnHref,
} from '../src/app/app/customers/return-context';

const customerId = '00000000-0000-4000-8000-000000000101';

describe('customer return context', () => {
  it('preserves directory state through create and selects the saved row', () => {
    const directory = '/app/customers?q=market&activity=with-orders&sort=name&page=2#results';
    const create = customerCreateHref(customerReturnContext(directory, undefined));
    const params = new URL(create, 'https://customer-return.invalid').searchParams;
    const context = customerReturnContext(params.get('returnTo'), params.get('focusRow'));
    expect(customerReturnHref(context)).toBe(directory);
    expect(customerReturnHref(context, customerId))
      .toBe(`/app/customers?q=market&activity=with-orders&sort=name&page=2&customer=${customerId}&focusRow=${customerId}#results`);
  });

  it('preserves an order origin and selects the saved customer', () => {
    const context = customerReturnContext('/app/orders?draft=abc&customer=old#new-order', undefined);
    expect(customerReturnHref(context, customerId))
      .toBe(`/app/orders?draft=abc&customer=${customerId}#new-order`);
  });

  it('keeps the original directory focus row on cancel or back', () => {
    const context = customerReturnContext('/app/customers?q=market', customerId);
    expect(customerReturnHref(context)).toBe(`/app/customers?q=market&focusRow=${customerId}`);
  });

  it('uses a safe customer fallback for hostile or unrelated destinations', () => {
    ['//evil.example', '/app/products', '/app/customers/new', '/app/orders/%2e%2e/customers']
      .forEach((href) => {
        expect(customerReturnContext(href, undefined).href).toBe('/app/customers');
      });
  });

  it('does not retain unbounded or unrelated directory parameters', () => {
    expect(customerDirectoryHref({
      customer: customerId, q: 'a', unrelated: 'x', page: ['1', '2'],
    }))
      .toBe(`/app/customers?customer=${customerId}&q=a`);
  });
});
