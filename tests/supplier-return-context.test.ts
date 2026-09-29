import { describe, expect, it } from 'vitest';
import {
  isSupplierDirectoryReturn, isSupplierHomeReturn, supplierReturnContext,
} from '../src/lib/supplier-return-context';

const ingredientId = '00000000-0000-4000-8000-000000000100';

describe('supplier return context', () => {
  it('preserves supplier directory query and focus when creating from its toolbar', () => {
    expect(supplierReturnContext('/app/suppliers?q=greens&status=active#results', 'supplier-1'))
      .toEqual({ href: '/app/suppliers?q=greens&status=active#results', focusRow: 'supplier-1' });
    expect(isSupplierDirectoryReturn('/app/suppliers?q=greens#results')).toBe(true);
  });

  it('accepts a specific ingredient detail return without treating it as the supplier directory', () => {
    const href = `/app/ingredients/${ingredientId}?addPack=1`;
    expect(supplierReturnContext(href, undefined).href).toBe(href);
    expect(isSupplierDirectoryReturn(href)).toBe(false);
  });

  it('accepts Home and drops supplier-row focus outside the directory', () => {
    expect(supplierReturnContext('/app', 'supplier-1')).toEqual({ href: '/app' });
    expect(isSupplierHomeReturn('/app')).toBe(true);
    expect(isSupplierDirectoryReturn('/app')).toBe(false);
    expect(supplierReturnContext(`/app/ingredients/${ingredientId}?addPack=1`, 'supplier-1'))
      .toEqual({ href: `/app/ingredients/${ingredientId}?addPack=1` });
  });

  it('falls back safely for malformed, external, and out-of-scope destinations', () => {
    [
      '//evil.example',
      `https://evil.example/app/ingredients/${ingredientId}`,
      '/app/orders',
      '/app/orders?returnTo=/app',
      '/appish',
      '/app/ingredients/new',
      '/app/ingredients/not-a-uuid',
      '/app/ingredients/%2e%2e/orders',
      '/app/ingredients/%zz',
    ].forEach((destination) => {
      expect(supplierReturnContext(destination, undefined).href).toBe('/app/suppliers');
    });
  });
});
