import type { CustomerOption } from '@/domain/customer-pricing';

export interface CustomerPricingProduct {
  id: string;
  name: string;
  product_code: string | null;
  bag_size_gallons: number;
  bags_per_case: number;
  active: boolean;
}

export type PricingConfigurationFilter = 'all' | 'configured' | 'unconfigured';
export type PricingAvailabilityFilter = 'all' | 'active' | 'inactive';

export interface CustomerPricingFilters {
  query: string;
  configuration: PricingConfigurationFilter;
  availability: PricingAvailabilityFilter;
}

export interface CustomerPricingProductView {
  product: CustomerPricingProduct;
  options: CustomerOption[];
}

function includesSearchTerm(
  product: CustomerPricingProduct,
  options: CustomerOption[],
  normalizedQuery: string,
) {
  if (!normalizedQuery) return true;
  return [
    product.name,
    product.product_code ?? '',
    ...options.flatMap((option) => [option.label, option.unit_name]),
  ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
}

/** Build the visible customer-price catalog without changing the selected customer. */
export function selectCustomerPricingProducts(
  products: CustomerPricingProduct[],
  options: CustomerOption[],
  customerId: string,
  filters: CustomerPricingFilters,
): CustomerPricingProductView[] {
  const normalizedQuery = filters.query.trim().toLocaleLowerCase();
  const optionsByProduct = new Map<string, CustomerOption[]>();
  options.forEach((option) => {
    if (option.customer_id !== customerId) return;
    const productOptions = optionsByProduct.get(option.product_id) ?? [];
    productOptions.push(option);
    optionsByProduct.set(option.product_id, productOptions);
  });

  return products
    .map((product) => ({
      product,
      options: (optionsByProduct.get(product.id) ?? [])
        .toSorted((left, right) => left.label.localeCompare(right.label)),
    }))
    .filter(({ product, options: productOptions }) => {
      const isConfigured = productOptions.length > 0;
      if (filters.configuration === 'configured' && !isConfigured) return false;
      if (filters.configuration === 'unconfigured' && isConfigured) return false;
      if (filters.availability === 'active'
        && (!product.active || (isConfigured && !productOptions.some((option) => option.active)))) {
        return false;
      }
      if (filters.availability === 'inactive'
        && product.active && (!isConfigured || productOptions.some((option) => option.active))) {
        return false;
      }
      return includesSearchTerm(product, productOptions, normalizedQuery);
    })
    .toSorted((left, right) => left.product.name.localeCompare(right.product.name));
}

export function countConfiguredProducts(options: CustomerOption[], customerId: string) {
  return new Set(
    options
      .filter((option) => option.customer_id === customerId)
      .map((option) => option.product_id),
  ).size;
}
