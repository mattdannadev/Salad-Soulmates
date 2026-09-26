import { expect, it } from 'vitest';
import authConfirmationUrl from '../src/domain/auth-callback-url';

it('keeps Preview reset and invitation callbacks away from production', () => {
  expect(authConfirmationUrl({
    VERCEL_ENV: 'preview',
    VERCEL_URL: 'preview.example.test',
    VERCEL_PROJECT_PRODUCTION_URL: 'production.example.test',
  })).toBe('https://preview.example.test/auth/confirm?next=/reset-password');
});
it('requires an explicit hosted destination and supports local development', () => {
  expect(() => authConfirmationUrl({ VERCEL_ENV: 'preview' })).toThrow('not configured');
  expect(authConfirmationUrl({})).toBe('http://localhost:3000/auth/confirm?next=/reset-password');
  expect(authConfirmationUrl({ VERCEL_ENV: 'production', VERCEL_PROJECT_PRODUCTION_URL: 'app.example.test' }))
    .toBe('https://app.example.test/auth/confirm?next=/reset-password');
});
it.each(['https://example.test', 'user@example.test', 'example.test/path', 'example.test?other'])('rejects malformed callback host %s', (host) => {
  expect(() => authConfirmationUrl({ VERCEL_PROJECT_PRODUCTION_URL: host })).toThrow();
});
