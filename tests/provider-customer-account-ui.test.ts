import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it } from 'vitest';
import ProviderCustomerAccountDirectory, {
  type ProviderCustomerAccountDirectoryState,
} from '@/components/provider/provider-customer-account-directory';
import ProviderCustomerAccountDetailView, {
  type ProviderCustomerAccountDetailState,
} from '@/components/provider/provider-customer-account-detail';

const accountHref = (id: string) => `/provided/accounts/${id}`;
const tenantHref = (id: string) => `/provided/tenants/${id}`;

function renderDirectory(state: ProviderCustomerAccountDirectoryState): string {
  return renderToStaticMarkup(createElement(ProviderCustomerAccountDirectory, {
    state, accountHref, tenantsHref: '/provided/tenants',
  }));
}

function renderDetail(state: ProviderCustomerAccountDetailState): string {
  return renderToStaticMarkup(createElement(ProviderCustomerAccountDetailView, {
    state, backHref: '/provided/accounts', tenantHref,
  }));
}

it('renders a read-only customer account directory from supplied summaries and links', () => {
  const html = renderDirectory({
    kind: 'ready',
    accounts: [
      {
        id: 'one', name: 'A & B', status: 'active', linkedTenantCount: 1200,
      },
      {
        id: 'two', name: 'Second', status: 'suspended', linkedTenantCount: 0,
      },
      {
        id: 'three', name: 'Third', status: 'archived', linkedTenantCount: 1,
      },
    ],
  });
  expect(html).toContain('Customer account directory');
  expect(html).toContain('href="/provided/accounts/one"');
  expect(html).toContain('href="/provided/tenants"');
  expect(html).toContain('A &amp; B');
  expect(html).toContain('1,200');
  expect(html).toContain('Active');
  expect(html).toContain('Suspended');
  expect(html).toContain('Archived');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<form');
});

it('renders only redacted linked tenant summaries in customer account detail', () => {
  const html = renderDetail({
    kind: 'ready',
    account: {
      id: 'one',
      name: 'A & B',
      status: 'active',
      linkedTenantCount: 1,
      linkedTenants: [{
        id: 'tenant-1',
        name: 'North Kitchen',
        slug: 'north-kitchen',
        status: 'active',
        createdAt: '2026-09-01T00:00:00Z',
        enabledUserCount: 42,
        facilityCount: 3,
      }],
    },
  });
  expect(html).toContain('href="/provided/accounts"');
  expect(html).toContain('href="/provided/tenants/tenant-1"');
  expect(html).toContain('A &amp; B');
  expect(html).toContain('North Kitchen');
  expect(html).toContain('north-kitchen');
  expect(html).not.toContain('Sep 1, 2026');
  expect(html).not.toContain('Facilities');
  expect(html).not.toContain('Enabled users');
  expect(html).not.toContain('<button');
  expect(html).not.toContain('<form');
});

it('shows empty linked tenants without implying provisioning', () => {
  const html = renderDetail({
    kind: 'ready',
    account: {
      id: 'one', name: 'Unlinked', status: 'archived', linkedTenantCount: 0, linkedTenants: [],
    },
  });
  expect(html).toContain('No tenants are linked to this account.');
  expect(html).not.toContain('<table');
});

it('keeps non-ready states separate and free of account data', () => {
  const states = [
    ['loading', 'Loading customer accounts', 'Loading customer account'],
    ['denied', 'Provider access is required', 'Provider access is required'],
    ['not-found', 'Customer accounts not found', 'Customer account not found'],
    ['unavailable', 'temporarily unavailable', 'temporarily unavailable'],
  ] as const;
  states.forEach(([kind, directoryMessage, detailMessage]) => {
    const directory = renderDirectory({ kind });
    const detail = renderDetail({ kind });
    expect(directory).toContain(directoryMessage);
    expect(detail).toContain(detailMessage);
    expect(directory).not.toContain('<table');
    expect(detail).not.toContain('<dl');
  });
});
