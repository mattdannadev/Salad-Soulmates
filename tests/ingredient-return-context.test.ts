import { describe, expect, it } from 'vitest';
import {
  ingredientLinkHref, ingredientReturnContext, ingredientReturnHref,
} from '../src/app/app/ingredients/return-context';

const ingredientId = '00000000-0000-4000-8000-000000000100';

describe('ingredient return context', () => {
  it('round-trips directory query state and focus identity through a detail link', () => {
    const origin = '/app/ingredients?q=garlic&status=inactive&type=dry#results';
    const link = ingredientLinkHref(`/app/ingredients/${ingredientId}`, {
      href: origin,
      focusRow: ingredientId,
    });
    const query = new URL(link, 'https://ingredient-return.invalid').searchParams;
    const detailHref = `/app/ingredients/${ingredientId}`;
    const context = ingredientReturnContext(query.get('returnTo'), query.get('focusRow'), detailHref);
    expect(context).toEqual({ href: origin, focusRow: ingredientId });
    expect(ingredientReturnHref(context, ingredientId))
      .toBe(`/app/ingredients?q=garlic&status=inactive&type=dry&focusRow=${ingredientId}#results`);
  });

  it('uses the directory fallback for unsafe and out-of-scope destinations', () => {
    [
      '//evil.example', '/app/orders', '/app/ingredients/new',
      '/app/ingredients/not-a-uuid', '/app/ingredients/%2e%2e/orders',
    ].forEach((destination) => {
      expect(ingredientReturnContext(destination, undefined).href).toBe('/app/ingredients');
    });
  });

  it('keeps a direct detail fallback and ignores malformed focus identity', () => {
    const detail = `/app/ingredients/${ingredientId}`;
    expect(ingredientReturnContext(undefined, 'bad row', detail)).toEqual({ href: detail });
  });
});
