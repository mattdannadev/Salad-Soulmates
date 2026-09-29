import { describe, expect, it } from 'vitest';
import { resolveReturnContext, returnContextSearchParams } from '../src/lib/return-context';

const options = {
  fallbackHref: '/app/orders',
  isAllowedPathname: (pathname: string) => pathname === '/app/orders'
    || pathname.startsWith('/app/orders/'),
};

describe('resolveReturnContext', () => {
  it('preserves an allowed pathname, query, fragment, and focus row', () => {
    expect(resolveReturnContext('/app/orders?status=open&sort=due&page=3#results', 'order_123', options))
      .toEqual({ href: '/app/orders?status=open&sort=due&page=3#results', focusRow: 'order_123' });
  });

  it('round-trips return parameters without losing URL query state', () => {
    const context = resolveReturnContext('/app/orders?q=salad%20mix&page=2#orders', '42', options);
    const params = returnContextSearchParams(context);
    expect(resolveReturnContext(params.get('returnTo'), params.get('focusRow'), options))
      .toEqual(context);
  });

  it.each([
    undefined,
    null,
    '',
    'orders',
    '//evil.example/path',
    '/\\evil.example/path',
    'https://evil.example/app/orders',
    '/app/orders/..//evil.example',
    '/admin',
    '/app/orders%2f..%2fadmin',
    '/app/orders%5cadmin',
    '/app/orders%252fadmin',
    '/app/orders?bad=%xx',
    '/app/orders\n?status=open',
    `/${'a'.repeat(2048)}`,
  ])('uses the deterministic fallback for an invalid or unauthorized destination: %s', (value) => {
    expect(resolveReturnContext(value, undefined, options)).toEqual({ href: '/app/orders' });
  });

  it('drops malformed focus values while keeping the valid destination', () => {
    expect(resolveReturnContext('/app/orders?page=2', 'bad row', options))
      .toEqual({ href: '/app/orders?page=2' });
    expect(resolveReturnContext('/app/orders?page=2', 'a'.repeat(129), options))
      .toEqual({ href: '/app/orders?page=2' });
  });

  it('rejects a fallback outside the allowed destination set', () => {
    expect(() => resolveReturnContext(undefined, undefined, {
      ...options,
      fallbackHref: '/admin',
    })).toThrow('Return context fallback must be an allowed internal URL.');
  });
});
