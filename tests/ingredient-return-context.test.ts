import { describe, expect, it } from 'vitest';
import {
  ingredientLinkHref, ingredientReturnContext, ingredientReturnHref,
  ingredientSupplierRecoveryHref,
} from '../src/app/app/ingredients/return-context';
import { supplierReturnContext } from '../src/lib/supplier-return-context';

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

  it('returns onboarding creation and editing to Home without directory focus', () => {
    const context = ingredientReturnContext('/app', ingredientId);
    expect(context).toEqual({ href: '/app' });
    expect(ingredientReturnHref(context, ingredientId)).toBe('/app');
    expect(ingredientLinkHref('/app/ingredients/new', context))
      .toBe('/app/ingredients/new?returnTo=%2Fapp');
    expect(ingredientLinkHref(`/app/ingredients/${ingredientId}`, context))
      .toBe(`/app/ingredients/${ingredientId}?returnTo=%2Fapp`);
  });

  it('resumes supplier setup at the pack form with the original ingredient directory context', () => {
    const origin = '/app/ingredients?q=garlic&status=inactive#results';
    const recovery = ingredientSupplierRecoveryHref(ingredientId, {
      href: origin,
      focusRow: ingredientId,
    });
    const supplierQuery = new URL(recovery, 'https://return.invalid').searchParams;
    const resumedIngredient = supplierReturnContext(supplierQuery.get('returnTo'), undefined).href;
    const resumedUrl = new URL(resumedIngredient, 'https://return.invalid');

    expect(resumedUrl.pathname).toBe(`/app/ingredients/${ingredientId}`);
    expect(resumedUrl.searchParams.get('addPack')).toBe('1');
    expect(ingredientReturnContext(
      resumedUrl.searchParams.get('returnTo'),
      resumedUrl.searchParams.get('focusRow'),
      resumedUrl.pathname,
    )).toEqual({ href: origin, focusRow: ingredientId });
  });

  it('resumes a directly opened ingredient without manufacturing a directory origin', () => {
    const recovery = ingredientSupplierRecoveryHref(ingredientId);
    const supplierQuery = new URL(recovery, 'https://return.invalid').searchParams;
    const resumed = new URL(
      supplierReturnContext(supplierQuery.get('returnTo'), undefined).href,
      'https://return.invalid',
    );
    expect(resumed.pathname).toBe(`/app/ingredients/${ingredientId}`);
    expect(resumed.searchParams.get('returnTo')).toBeNull();
    expect(resumed.searchParams.get('addPack')).toBe('1');
  });
});
