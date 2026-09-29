import { describe, expect, it } from 'vitest';
import type { Customer } from '../src/domain/customer-pricing';
import type { CustomerOrder } from '../src/domain/customer-orders';
import {
  customerDirectoryConfig, customerDirectorySearchParams, customerDirectoryView,
} from '../src/app/app/customers/customer-directory';

const alpha: Customer = {
  id: '00000000-0000-4000-8000-000000000101',
  name: 'Alpha Market',
  contact_name: 'Alex',
  email: 'alex@example.test',
  phone: '555-0101',
  address: '',
  notes: '',
  revision: 1,
};
const bravo: Customer = {
  id: '00000000-0000-4000-8000-000000000102',
  name: 'Bravo Foods',
  contact_name: 'Brenda',
  email: 'brenda@example.test',
  phone: '555-0102',
  address: '',
  notes: '',
  revision: 1,
};
const customers: Customer[] = [alpha, bravo];

const orders: CustomerOrder[] = [{
  id: '00000000-0000-4000-8000-000000000201',
  customer_id: bravo.id,
  customer_name: bravo.name,
  reference: 'B-1',
  needed_on: '2026-10-01',
  products: [{
    product_id: '00000000-0000-4000-8000-000000000301',
    customer_product_option_id: null,
    batch_count: 1,
  }],
  items: [{
    product_id: '00000000-0000-4000-8000-000000000301',
    customer_product_option_id: null,
    batch_count: 1,
    product_name: 'Dressing',
    recipe_version_id: '00000000-0000-4000-8000-000000000401',
    version_number: 1,
    batch_gallons: 40,
    packaging_label: 'Bottle',
    unit_name: 'bottle',
    gallons_per_unit: 1,
    unit_price: 10,
    currency: 'USD',
    unit_count: 40,
    line_total: 400,
  }],
  created_at: '2026-09-28T00:00:00Z',
}];

describe('customer directory view', () => {
  const config = customerDirectoryConfig('en', true);

  it('searches contact details and preserves unrelated URL state', () => {
    const params = customerDirectorySearchParams({ q: 'BRENDA', customer: alpha.id });
    const view = customerDirectoryView(customers, orders, true, params, config);
    expect(params.get('customer')).toBe(alpha.id);
    expect(view.customers.map((customer) => customer.name)).toEqual(['Bravo Foods']);
    expect(view.resultCount).toBe(1);
  });

  it('filters and sorts by visible open orders', () => {
    const view = customerDirectoryView(
      customers,
      orders,
      true,
      new URLSearchParams('activity=with-orders&sort=orders-desc'),
      config,
    );
    expect(view.customers.map((customer) => customer.name)).toEqual(['Bravo Foods']);
    const without = customerDirectoryView(
      customers,
      orders,
      true,
      new URLSearchParams('activity=without-orders'),
      config,
    );
    expect(without.customers.map((customer) => customer.name)).toEqual(['Alpha Market']);
  });

  it('does not expose order filters to users without order permission', () => {
    const restrictedConfig = customerDirectoryConfig('es', false);
    const view = customerDirectoryView(
      customers,
      orders,
      false,
      new URLSearchParams('activity=with-orders&sort=orders-desc'),
      restrictedConfig,
    );
    expect(restrictedConfig.filters).toEqual([]);
    expect(view.resultCount).toBe(2);
    expect(view.query.filters.activity).toBe('');
    expect(view.query.sort).toBe('');
  });

  it('paginates and clamps an out-of-range page', () => {
    const many = Array.from({ length: 22 }, (_, index): Customer => ({
      ...alpha, id: `customer-${index}`, name: `Customer ${String(index).padStart(2, '0')}`,
    }));
    const view = customerDirectoryView(many, [], true, new URLSearchParams('page=2'), config);
    expect(view.pageCount).toBe(2);
    expect(view.customers).toHaveLength(2);
    expect(customerDirectoryView(many, [], true, new URLSearchParams('page=99'), config).page).toBe(2);
  });

  it('locates a returned customer on the filtered and sorted page', () => {
    const many = Array.from({ length: 22 }, (_, index): Customer => ({
      ...alpha, id: `customer-${index}`, name: `Customer ${String(index).padStart(2, '0')}`,
    }));
    const view = customerDirectoryView(
      many,
      [],
      true,
      new URLSearchParams('sort=name-desc&page=1'),
      config,
      many[0]?.id,
    );
    expect(view.page).toBe(1);
    expect(view.focusPage).toBe(2);
    expect(view.customers.some((customer) => customer.id === many[0]?.id)).toBe(false);
  });

  it('offers recovery when the returned customer is outside active criteria', () => {
    const view = customerDirectoryView(
      customers,
      orders,
      true,
      new URLSearchParams('q=Bravo'),
      config,
      alpha.id,
    );
    expect(view.resultCount).toBe(1);
    expect(view.focusPage).toBeNull();
  });

  it('ignores ambiguous and unbounded query values', () => {
    const view = customerDirectoryView(
      customers,
      orders,
      true,
      new URLSearchParams('q=Alpha&q=Bravo&page=999999999999999999&sort=unknown'),
      config,
    );
    expect(view.query.q).toBe('');
    expect(view.query.page).toBe(1);
    expect(view.query.sort).toBe('');
    expect(view.resultCount).toBe(2);
  });
});
