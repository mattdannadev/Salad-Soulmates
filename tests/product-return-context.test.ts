import { describe, expect, it } from 'vitest';
import productSetupReturnHref from '@/app/app/products/return-context';

const draftId = '10000000-0000-4000-8000-000000000001';

describe('product setup return context', () => {
  it('resumes the onboarding checklist from its exact Home URL', () => {
    expect(productSetupReturnHref('/app')).toBe('/app');
    expect(productSetupReturnHref(undefined)).toBeNull();
  });

  it('preserves an authorized order draft continuation', () => {
    const orderHref = `/app/orders?draft=${draftId}#new-order`;
    expect(productSetupReturnHref(orderHref)).toBe(orderHref);
  });

  it.each([
    'https://external.invalid/app',
    '//external.invalid/app',
    '/app/other',
    '/app?redirect=https://external.invalid',
    '/app#unexpected',
    '/%61pp',
  ])('does not treat another destination as Home: %s', (input) => {
    expect(productSetupReturnHref(input)).not.toBe('/app');
  });
});
