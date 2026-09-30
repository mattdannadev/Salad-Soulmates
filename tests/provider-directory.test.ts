import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ProviderDirectory, {
  type ProviderDirectoryState,
} from '@/components/provider/provider-directory';

function render(state: ProviderDirectoryState): string {
  return renderToStaticMarkup(createElement(ProviderDirectory, { state }));
}

it('renders a read-only tenant directory using the supplied summaries', () => {
  const html = render({
    kind: 'ready',
    tenants: [
      {
        id: 'tenant-1',
        name: 'North Kitchen',
        slug: 'north-kitchen',
        status: 'active',
        createdAt: '2026-09-01T23:30:00Z',
        enabledUserCount: 12,
        facilityCount: 2,
      },
      {
        id: 'tenant-2',
        name: 'South Kitchen',
        slug: 'south-kitchen',
        status: 'suspended',
        createdAt: 'invalid',
        enabledUserCount: 3,
        facilityCount: 1,
      },
    ],
  });
  expect(html).toContain('Tenant directory');
  expect(html).toContain('<table');
  expect(html).toContain('North Kitchen');
  expect(html).toContain('href="/admin/provider/tenant-1"');
  expect(html).toContain('north-kitchen');
  expect(html).toContain('Active');
  expect(html).toContain('Suspended');
  expect(html).toContain('Facilities');
  expect(html).toContain('Enabled users');
  expect(html).toContain('Sep 1, 2026');
  expect(html).toContain('—');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<form');
});

it('distinguishes an empty directory from loading, error, denied and unavailable states', () => {
  expect(render({ kind: 'ready', tenants: [] })).toContain('No tenants found.');
  expect(render({ kind: 'loading' })).toContain('Loading tenants…');
  expect(render({ kind: 'error' })).toContain('Tenants could not be loaded.');
  expect(render({ kind: 'denied' })).toContain('Provider access is required');
  expect(render({ kind: 'unavailable' })).toContain('tenant directory is temporarily unavailable');
  expect(render({ kind: 'denied' })).not.toContain('<table');
});
