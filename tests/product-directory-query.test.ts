import { describe, expect, it } from 'vitest';
import {
  parseProductDirectoryQuery, productDirectoryHref, selectProductDirectory,
  type ProductDirectoryRecord,
} from '@/app/app/products/directory-query';

const records: ProductDirectoryRecord[] = [
  {
    id: 'a',
    name: 'Apple dressing',
    productCode: 'APL',
    active: true,
    batchGallons: 40,
    hasReleasedRecipe: true,
    hasApprovedPackaging: true,
    hasActivePricing: false,
  },
  {
    id: 'b',
    name: 'Basil dressing',
    productCode: 'BSL',
    active: false,
    batchGallons: 80,
    hasReleasedRecipe: false,
    hasApprovedPackaging: false,
    hasActivePricing: true,
  },
];

describe('product directory URL contract', () => {
  it('rejects repeated, unknown, and malformed criteria', () => {
    const parsed = parseProductDirectoryQuery({
      q: ['Apple', 'Basil'], status: 'other', recipe: 'draft', page: '0', sort: 'wrong',
    });
    expect(parsed).toEqual({
      q: '',
      status: undefined,
      recipe: undefined,
      packaging: undefined,
      pricing: undefined,
      sort: 'name',
      page: 1,
    });
  });

  it('serializes only supported criteria for stable return links', () => {
    const parsed = parseProductDirectoryQuery({
      q: '  basil ',
      status: 'inactive',
      recipe: 'missing',
      packaging: 'missing',
      pricing: 'configured',
      sort: 'batch',
      page: '2',
      unknown: 'ignored',
    });
    expect(productDirectoryHref(parsed)).toBe(
      '/app/products?q=basil&status=inactive&recipe=missing&packaging=missing&pricing=configured&sort=batch&page=2',
    );
  });

  it('filters only recorded setup dimensions and sorts deterministically', () => {
    const missing = parseProductDirectoryQuery({
      recipe: 'missing', packaging: 'missing', pricing: 'configured',
    });
    expect(selectProductDirectory(records, missing, 'en').map((record) => record.id)).toEqual(['b']);
    const byBatch = parseProductDirectoryQuery({ sort: 'batch' });
    expect(selectProductDirectory(records, byBatch, 'en').map((record) => record.id))
      .toEqual(['b', 'a']);
  });
});
