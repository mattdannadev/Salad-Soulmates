import { expect, it } from 'vitest';
import authCallbackUrl from '../src/domain/auth-callback-url';

it('keeps Preview reset and invitation callbacks away from production', () => {
  expect(authCallbackUrl({
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'preview.example.test',
    VERCEL_PROJECT_PRODUCTION_URL: 'production.example.test',
  })).toBe('https://preview.example.test/auth/callback?next=/reset-password');
});
it('requires an explicit hosted destination and supports local development', () => {
  expect(() => authCallbackUrl({ VERCEL_ENV: 'preview' })).toThrow('not configured');
  expect(authCallbackUrl({})).toBe('http://localhost:3000/auth/callback?next=/reset-password');
  expect(authCallbackUrl({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'app.example.test' }))
    .toBe('https://app.example.test/auth/callback?next=/reset-password');
});
it.each(['https://example.test', 'user@example.test', 'example.test/path', 'example.test?other'])('rejects malformed callback host %s', (host) => {
  expect(() => authCallbackUrl({ VERCEL_PROJECT_PRODUCTION_URL: host })).toThrow();
});
