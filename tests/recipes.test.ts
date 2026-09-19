import { describe, expect, it } from 'vitest';
import { selectRecipeVersion, recipeQualityRuleRowSchema } from '../src/domain/recipes';
import { fixtureId, fixtureRecords } from './browser/fixture-data';

const recipe = fixtureRecords.recipes?.[0];
const versions = fixtureRecords.recipe_versions;
describe('recipe version selection', () => {
  it('uses the released active version ahead of a newer draft', () => {
    expect(selectRecipeVersion(recipe, versions)?.id).toBe(fixtureId(401));
  });
  it('lets an explicit history link select a draft without activating it', () => {
    expect(selectRecipeVersion(recipe, versions, fixtureId(402))?.status).toBe('Draft');
  });
  it('rejects malformed and cross-recipe version references', () => {
    expect(() => selectRecipeVersion(recipe, versions, 'bad-id')).toThrow();
    expect(selectRecipeVersion(recipe, versions, fixtureId(999))).toBeNull();
    const unrelated = [{ ...versions?.[0], recipe_id: fixtureId(999) }];
    expect(selectRecipeVersion(recipe, unrelated, fixtureId(401))).toBeNull();
  });
  it('fails visibly for a missing or unreleased active version', () => {
    expect(() => selectRecipeVersion(recipe, [])).toThrow('missing');
    expect(() => selectRecipeVersion({ ...recipe, active_version_id: fixtureId(402) }, versions)).toThrow('not released');
  });
  it('handles recipes without any recorded version', () => {
    expect(selectRecipeVersion({ ...recipe, active_version_id: null }, [])).toBeNull();
  });
  it('rejects an inverted quality-control range', () => {
    expect(recipeQualityRuleRowSchema.safeParse({
      id: fixtureId(500),
      recipe_version_id: fixtureId(401),
      name: 'Example',
      min_value: 2,
      max_value: 1,
      uom: '',
      instructions: '',
      sequence: 1,
    }).success).toBe(false);
  });
});
