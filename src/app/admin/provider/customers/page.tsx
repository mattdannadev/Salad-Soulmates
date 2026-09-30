import ProviderCustomerAccountDirectory from '@/components/provider/provider-customer-account-directory';
import {
  listProviderCustomerAccounts,
  ProviderConsoleAccessError,
} from '@/services/provider-console';

export const dynamic = 'force-dynamic';

export default async function ProviderCustomerAccountsPage() {
  try {
    const accounts = await listProviderCustomerAccounts();
    return (
      <ProviderCustomerAccountDirectory
        accountHref={(accountId) => `/admin/provider/customers/${accountId}`}
        state={{ kind: 'ready', accounts }}
        tenantsHref="/admin/provider"
      />
    );
  } catch (error) {
    const state =
      error instanceof ProviderConsoleAccessError
        ? { kind: 'denied' as const }
        : { kind: 'unavailable' as const };
    return (
      <ProviderCustomerAccountDirectory
        accountHref={() => '/admin/provider/customers'}
        state={state}
        tenantsHref="/admin/provider"
      />
    );
  }
}
