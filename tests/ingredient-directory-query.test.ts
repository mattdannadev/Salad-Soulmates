import { describe, expect, it } from 'vitest';
import { parseIngredientDirectoryQuery } from '../src/app/app/ingredients/directory-query';

describe('ingredient directory query', () => {
  it('accepts bookmarked filters, sort, and page', () => {
    expect(parseIngredientDirectoryQuery({
      q: '  basil ', type: 'dry', status: 'inactive', stock: 'reorder', sort: 'stock', page: '2',
    })).toEqual({
      q: 'basil', type: 'dry', status: 'inactive', stock: 'reorder', sort: 'stock', page: 2,
    });
  });

  it('preserves the explicit all-status view and rejects malformed criteria', () => {
    expect(parseIngredientDirectoryQuery({
      q: ['one', 'two'], type: 'all', status: 'all', stock: 'unknown', sort: 'bogus', page: '0',
    })).toEqual({
      q: '', type: undefined, status: 'all', stock: undefined, sort: 'name', page: 1,
    });
    expect(parseIngredientDirectoryQuery({ status: ['active', 'inactive'] }).status).toBe('active');
  });
});
