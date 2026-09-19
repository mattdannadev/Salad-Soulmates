import { describe, expect, it } from 'vitest';
import prepareIngredientReview from '../scripts/prepare-ingredient-load.mjs';

describe('worksheet review import', () => {
  const header = 'worksheet,recipe,ingredient,quantity,unit\n';
  it('handles quoted commas, escaped quotes, BOM, and multiline fields', () => {
    const result: string = prepareIngredientReview(
      `\uFEFF${header}W,R,"Salt, fine",1,lb\nW,R,"Lemon ""fresh""\njuice",2,gal\n`,
    );
    expect(result).toContain('Salt, fine');
    expect(result).toContain('Lemon ""fresh""');
  });
  it('rejects malformed input without writing partial output', () => {
    expect(() => prepareIngredientReview(`${header}W,R,"unclosed,1,lb`)).toThrow();
    expect(() => prepareIngredientReview('worksheet,recipe,ingredient,quantity,quantity\n')).toThrow();
    expect(() => prepareIngredientReview(`${header}W,R,,1,lb`)).toThrow();
  });
  it('groups source aliases while requiring human approval and unit review', () => {
    const result: string = prepareIngredientReview(`${header}W,R,Salt,1,lb\nW,R,salt,1,oz`);
    expect(result).toContain('Salt | salt');
    expect(result).toContain('Review aliases or units');
    expect(result).toContain('"false"');
  });
  it('exports formula-looking names as literal spreadsheet text', () => {
    const result: string = prepareIngredientReview(`${header}W,R,=1+1,1,lb`);
    expect(result).toContain("'=1+1");
  });
});
