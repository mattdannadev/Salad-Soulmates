import { describe, expect, it } from 'vitest';
import {
  parseSupplierDirectoryQuery, supplierCreateReturnHref,
  supplierDirectoryHref, supplierPageForRow,
} from '../src/app/app/suppliers/directory-query';

describe('supplier directory query', () => {
  it('accepts supported criteria and keeps a bookmarked page', () => {
    expect(parseSupplierDirectoryQuery({
      q: '  greens ', status: 'inactive', sort: 'name-desc', page: '3',
    })).toEqual({
      q: 'greens', status: 'inactive', sort: 'name-desc', page: 3,
    });
  });

  it('rejects repeated, unsupported, and oversized values', () => {
    expect(parseSupplierDirectoryQuery({
      q: ['first', 'second'], status: 'unknown', sort: 'open-purchases', page: '-2',
    })).toEqual({
      q: '', status: undefined, sort: 'open-purchases', page: 1,
    });
    expect(parseSupplierDirectoryQuery({ q: 'x'.repeat(201), page: '1000001' }))
      .toEqual({
        q: '', status: undefined, sort: 'name', page: 1,
      });
  });

  it('keeps only authorized, supported criteria in a create return path', () => {
    expect(supplierDirectoryHref({
      q: '  greens ',
      status: 'inactive',
      sort: 'open-purchases',
      page: '3',
      returnTo: '/app/orders',
      unexpected: 'value',
    }, false)).toBe('/app/suppliers?q=greens&status=inactive&page=3');
    expect(supplierDirectoryHref({
      q: 'greens', sort: 'open-purchases', page: '2',
    }, true)).toBe('/app/suppliers?q=greens&sort=open-purchases&page=2');
  });

  it('returns to Home only for the checklist origin and otherwise retains directory filters', () => {
    expect(supplierCreateReturnHref({ returnTo: '/app', q: 'greens' }, false)).toBe('/app');
    expect(supplierCreateReturnHref({ returnTo: '/app/orders', q: 'greens' }, false))
      .toBe('/app/suppliers?q=greens');
    expect(supplierCreateReturnHref({ returnTo: ['app', '/app'], q: 'greens' }, false))
      .toBe('/app/suppliers?q=greens');
  });

  it('finds the page containing a returned supplier', () => {
    const ids = Array.from({ length: 41 }, (_, index) => `supplier-${index + 1}`);
    expect(supplierPageForRow(ids, 'supplier-21', 20)).toBe(2);
    expect(supplierPageForRow(ids, 'supplier-41', 20)).toBe(3);
    expect(supplierPageForRow(ids, 'missing', 20)).toBeUndefined();
  });
});
