import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ProviderTenantDetail, {
  type ProviderTenantDetailState,
} from '@/components/provider/provider-tenant-detail';

function render(state: ProviderTenantDetailState, backHref = '/admin/provider/tenants'): string {
  return renderToStaticMarkup(createElement(ProviderTenantDetail, { state, backHref }));
}

it('renders only the supplied tenant summary in a read-only, labeled detail view', () => {
  const html = render({
    kind: 'ready',
    tenant: {
      id: 'tenant-1',
      name: 'North & Kitchen',
      slug: 'north-kitchen',
      status: 'active',
      createdAt: '2026-09-01T23:30:00Z',
      enabledUserCount: 1200,
      facilityCount: 2,
    },
  });

  expect(html).toContain('href="/admin/provider/tenants"');
  expect(html).toContain('Back to tenants');
  expect(html).toContain('aria-labelledby="provider-tenant-summary-title"');
  expect(html).toContain('<dl');
  expect(html).toContain('North &amp; Kitchen');
  expect(html).toContain('north-kitchen');
  expect(html).not.toContain('tenant-1');
  expect(html).toContain('Active');
  expect(html).toContain('Sep 1, 2026');
  expect(html).toContain('1,200');
  expect(html).toContain('Facilities');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<form');
  expect(html).not.toContain('Billing');
  expect(html).not.toContain('Health');
});

it('renders suspended status and an invalid date without inventing a date', () => {
  const html = render({
    kind: 'ready',
    tenant: {
      id: 'tenant-2',
      name: 'South Kitchen',
      slug: 'south-kitchen',
      status: 'suspended',
      createdAt: 'invalid',
      enabledUserCount: 0,
      facilityCount: 0,
    },
  });
  expect(html).toContain('Suspended');
  expect(html).toContain('—');
});

it('distinguishes loading, denied, not-found, and unavailable without leaking details', () => {
  const states: [ProviderTenantDetailState, string][] = [
    [{ kind: 'loading' }, 'Loading tenant…'],
    [{ kind: 'denied' }, 'Provider access is required'],
    [{ kind: 'not-found' }, 'Tenant not found.'],
    [{ kind: 'unavailable' }, 'Tenant details are temporarily unavailable.'],
  ];
  states.forEach(([state, message]) => {
    const html = render(state, '/provider');
    expect(html).toContain(message);
    expect(html).toContain('href="/provider"');
    expect(html).not.toContain('<dl');
  });
});
