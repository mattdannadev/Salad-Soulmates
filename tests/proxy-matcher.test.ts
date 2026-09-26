import { expect, it } from 'vitest';
import { unstable_doesProxyMatch } from 'next/experimental/testing/server';
import { config } from '../src/proxy';

it('refreshes sessions for platform administration routes', () => {
  const nextConfig = {};
  expect(unstable_doesProxyMatch({ config, nextConfig, url: 'https://example.test/admin' })).toBe(true);
  expect(unstable_doesProxyMatch({ config, nextConfig, url: 'https://example.test/admin/organizations' })).toBe(true);
});
