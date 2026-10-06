import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, expect, it, vi,
} from 'vitest';
import ProviderConsolePage from '@/app/admin/provider/page';
import ProviderCustomerAccountsPage from '@/app/admin/provider/customers/page';
import ProviderTenantDetailPage from '@/app/admin/provider/[tenantId]/page';
import ProviderCustomerAccountDetailPage from '@/app/admin/provider/customers/[accountId]/page';

const state = vi.hoisted(() => {
  const errorType = () => class extends Error {};
  return {
    tenants: vi.fn(),
    accounts: vi.fn(),
    tenant: vi.fn(),
    account: vi.fn(),
    log: vi.fn(),
    AccessError: errorType(),
    TenantMissing: errorType(),
    AccountMissing: errorType(),
    navigation: new Error('navigation control flow'),
    missing: new Error('not found control flow'),
  };
});

vi.mock('@/services/provider-console', () => ({
  listProviderTenants: state.tenants,
  listProviderCustomerAccounts: state.accounts,
  getProviderTenantDetail: state.tenant,
  getProviderCustomerAccountDetail: state.account,
  ProviderConsoleAccessError: state.AccessError,
  ProviderTenantNotFoundError: state.TenantMissing,
  ProviderCustomerAccountNotFoundError: state.AccountMissing,
}));
vi.mock('@/lib/operation-error', () => ({ logFailure: state.log }));
vi.mock('next/navigation', () => ({
  unstable_rethrow: (error: unknown) => {
    if (error === state.navigation) throw state.navigation;
  },
  notFound: () => {
    throw state.missing;
  },
}));

const pages = [
  { load: state.tenants, render: () => ProviderConsolePage() },
  { load: state.accounts, render: () => ProviderCustomerAccountsPage() },
  {
    load: state.tenant,
    render: () => ProviderTenantDetailPage({ params: Promise.resolve({ tenantId: 'tenant' }) }),
  },
  {
    load: state.account,
    render: () => ProviderCustomerAccountDetailPage({
      params: Promise.resolve({ accountId: 'account' }),
    }),
  },
];

beforeEach(() => vi.clearAllMocks());

it.each(pages)('renders access denial without logging it as a load failure', async (page) => {
  page.load.mockRejectedValueOnce(new state.AccessError());
  const html = renderToStaticMarkup(await page.render());
  expect(html).toMatch(/access|permission|restricted/i);
  expect(state.log).not.toHaveBeenCalled();
});

it.each(pages)('logs unexpected load failures and renders recovery', async (page) => {
  const failure = new Error('synthetic load failure');
  page.load.mockRejectedValueOnce(failure);
  const html = renderToStaticMarkup(await page.render());
  expect(html).toMatch(/unavailable|could not|unable/i);
  expect(state.log).toHaveBeenCalledWith(expect.any(String), failure);
});

it.each(pages)('preserves framework navigation control flow', async (page) => {
  page.load.mockRejectedValueOnce(state.navigation);
  await expect(page.render()).rejects.toBe(state.navigation);
  expect(state.log).not.toHaveBeenCalled();
});

it('preserves not-found responses for missing detail records', async () => {
  state.tenant.mockRejectedValueOnce(new state.TenantMissing());
  state.account.mockRejectedValueOnce(new state.AccountMissing());
  await expect(ProviderTenantDetailPage({
    params: Promise.resolve({ tenantId: 'missing' }),
  })).rejects.toBe(state.missing);
  await expect(ProviderCustomerAccountDetailPage({
    params: Promise.resolve({ accountId: 'missing' }),
  })).rejects.toBe(state.missing);
  expect(state.log).not.toHaveBeenCalled();
});
