import { describe, expect, it } from 'vitest';
import type { CustomerOption } from '@/domain/customer-pricing';
import {
  countConfiguredProducts,
  selectCustomerPricingProducts,
  type CustomerPricingProduct,
} from '@/features/customer-pricing/customer-pricing-view';

const appleProductId = '00000000-0000-4000-8000-000000000001';
const basilProductId = '00000000-0000-4000-8000-000000000002';
const retiredProductId = '00000000-0000-4000-8000-000000000003';

const products: CustomerPricingProduct[] = [
  {
    id: appleProductId,
    name: 'Apple Dressing',
    product_code: 'APL',
    bag_size_gallons: 2,
    bags_per_case: 2,
    active: true,
  },
  {
    id: basilProductId,
    name: 'Basil Dressing',
    product_code: 'BSL',
    bag_size_gallons: 1,
    bags_per_case: 4,
    active: true,
  },
  {
    id: retiredProductId,
    name: 'Retired Dressing',
    product_code: null,
    bag_size_gallons: 1,
    bags_per_case: 1,
    active: false,
  },
];

const options: CustomerOption[] = [
  {
    id: '00000000-0000-4000-8000-000000000101',
    customer_id: '00000000-0000-4000-8000-000000000201',
    product_id: appleProductId,
    revision: 3,
    label: 'Wholesale case',
    packaging_mode: 'product_default',
    unit_name: 'case',
    gallons_per_unit: 4,
    unit_price: 20,
    currency: 'USD',
    active: true,
    is_preferred: true,
  },
  {
    id: '00000000-0000-4000-8000-000000000102',
    customer_id: '00000000-0000-4000-8000-000000000202',
    product_id: basilProductId,
    revision: 1,
    label: 'Other customer case',
    packaging_mode: 'product_default',
    unit_name: 'case',
    gallons_per_unit: 4,
    unit_price: 24,
    currency: 'USD',
    active: true,
    is_preferred: false,
  },
  {
    id: '00000000-0000-4000-8000-000000000103',
    customer_id: '00000000-0000-4000-8000-000000000201',
    product_id: retiredProductId,
    revision: 1,
    label: 'Old case',
    packaging_mode: 'product_default',
    unit_name: 'case',
    gallons_per_unit: 1,
    unit_price: 10,
    currency: 'USD',
    active: false,
    is_preferred: false,
  },
];

const customerId = '00000000-0000-4000-8000-000000000201';

describe('customer pricing workspace view', () => {
  it('isolates one customer and reports configured products once', () => {
    expect(countConfiguredProducts(options, customerId)).toBe(2);
    const view = selectCustomerPricingProducts(products, options, customerId, {
      query: '', configuration: 'configured', availability: 'all',
    });
    expect(view.map(({ product }) => product.name)).toEqual([
      'Apple Dressing',
      'Retired Dressing',
    ]);
    expect(view[0]?.options[0]?.revision).toBe(3);
  });

  it('searches product codes and customer option details', () => {
    const byCode = selectCustomerPricingProducts(products, options, customerId, {
      query: 'bsl', configuration: 'all', availability: 'all',
    });
    expect(byCode.map(({ product }) => product.name)).toEqual(['Basil Dressing']);

    const byPriceOption = selectCustomerPricingProducts(products, options, customerId, {
      query: 'wholesale', configuration: 'all', availability: 'all',
    });
    expect(byPriceOption.map(({ product }) => product.name)).toEqual(['Apple Dressing']);
  });

  it('separates missing, active, and inactive pricing states', () => {
    const unconfigured = selectCustomerPricingProducts(products, options, customerId, {
      query: '', configuration: 'unconfigured', availability: 'all',
    });
    expect(unconfigured.map(({ product }) => product.name)).toEqual(['Basil Dressing']);

    const active = selectCustomerPricingProducts(products, options, customerId, {
      query: '', configuration: 'all', availability: 'active',
    });
    expect(active.map(({ product }) => product.name)).toEqual([
      'Apple Dressing',
      'Basil Dressing',
    ]);

    const inactive = selectCustomerPricingProducts(products, options, customerId, {
      query: '', configuration: 'all', availability: 'inactive',
    });
    expect(inactive.map(({ product }) => product.name)).toEqual(['Retired Dressing']);
  });
});
