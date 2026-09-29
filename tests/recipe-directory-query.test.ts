import { describe, expect, it } from 'vitest';
import { productRowSchema, recipeRowSchema, recipeVersionRowSchema } from '../src/domain/recipes';
import {
  parseRecipeDirectoryQuery, recipeDirectoryHref, recipeDirectoryRows, recipePageForRow,
} from '../src/app/app/recipes/directory-query';
import { fixtureId, fixtureRecords } from './browser/fixture-data';

const products = productRowSchema.array().parse(fixtureRecords.products);
const recipes = recipeRowSchema.array().parse(fixtureRecords.recipes);
const versions = recipeVersionRowSchema.array().parse(fixtureRecords.recipe_versions);

describe('recipe directory query', () => {
  it('keeps only allowlisted URL state in return links', () => {
    expect(recipeDirectoryHref({
      q: '  Italian  ',
      status: 'Released',
      released: 'yes',
      sort: 'version-desc',
      page: '3',
      returnTo: 'https://example.invalid/',
    })).toBe('/app/recipes?q=Italian&status=Released&released=yes&sort=version-desc&page=3');
    expect(parseRecipeDirectoryQuery({
      q: ['one', 'two'], status: 'Active', released: 'maybe', sort: 'bogus', page: '0',
    })).toEqual({
      q: '', status: undefined, released: undefined, sort: 'name', page: 1,
    });
  });

  it('filters by the displayed active release while keeping newer drafts out of that status', () => {
    const released = recipeDirectoryRows(
      recipes,
      products,
      versions,
      parseRecipeDirectoryQuery({ status: 'Released', released: 'yes' }),
      'en',
    );
    expect(released).toHaveLength(1);
    expect(released[0]?.version?.id).toBe(fixtureId(401));
    expect(recipeDirectoryRows(
      recipes,
      products,
      versions,
      parseRecipeDirectoryQuery({ status: 'Draft' }),
      'en',
    )).toHaveLength(0);
    expect(recipeDirectoryRows(
      recipes,
      products,
      versions,
      parseRecipeDirectoryQuery({ released: 'no' }),
      'en',
    )).toHaveLength(0);
  });

  it('finds the page for a returned recipe row', () => {
    expect(recipePageForRow(['a', 'b', 'c'], 'c', 2)).toBe(2);
    expect(recipePageForRow(['a', 'b'], 'missing', 2)).toBeUndefined();
  });
});
