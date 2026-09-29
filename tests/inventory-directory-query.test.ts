import { describe, expect, it } from 'vitest';
import {
  parseInventoryDirectoryQuery, selectInventoryIngredients,
} from '../src/app/app/inventory/directory-query';

const ingredients = [
  {
    id: 'basil', name: 'Basil', category: 'Dry', active: true, reorder_point: 5,
  },
  {
    id: 'cream', name: 'Cream', category: 'Liquid', active: true, reorder_point: 2,
  },
  {
    id: 'dill', name: 'Dill', category: 'Dry', active: false, reorder_point: null,
  },
];
const balances = { basil: 4, cream: 8, dill: 0 };

describe('inventory directory query', () => {
  it('accepts supported bookmarked criteria and defaults malformed values', () => {
    expect(parseInventoryDirectoryQuery({
      q: '  basil  ',
      type: 'dry',
      status: 'inactive',
      stock: 'reorder',
      sort: 'stock',
      page: '2',
    })).toEqual({
      q: 'basil',
      type: 'dry',
      status: 'inactive',
      stock: 'reorder',
      sort: 'stock',
      page: 2,
    });
    expect(parseInventoryDirectoryQuery({
      q: ['a', 'b'],
      type: 'all',
      status: ['active', 'inactive'],
      stock: 'unknown',
      sort: 'bogus',
      page: '-1',
    })).toEqual({
      q: '',
      type: undefined,
      status: 'active',
      stock: undefined,
      sort: 'name',
      page: 1,
    });
  });

  it('separates at reorder, above reorder, and missing thresholds', () => {
    const query = parseInventoryDirectoryQuery({ status: 'all', stock: 'reorder' });
    expect(selectInventoryIngredients(ingredients, balances, query, 'en').map((item) => item.id))
      .toEqual(['basil']);
    expect(selectInventoryIngredients(ingredients, balances, { ...query, stock: 'above' }, 'en')
      .map((item) => item.id)).toEqual(['cream']);
    expect(selectInventoryIngredients(ingredients, balances, { ...query, stock: 'unset' }, 'en')
      .map((item) => item.id)).toEqual(['dill']);
  });

  it('sorts the filtered results before paging', () => {
    const query = parseInventoryDirectoryQuery({ status: 'all', sort: 'stock' });
    expect(selectInventoryIngredients(ingredients, balances, query, 'en').map((item) => item.id))
      .toEqual(['dill', 'basil', 'cream']);
    expect(selectInventoryIngredients(ingredients, balances, {
      ...query, status: 'active', type: 'dry',
    }, 'en').map((item) => item.id)).toEqual(['basil']);
  });
});
