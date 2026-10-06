import { unstable_rethrow } from 'next/navigation';
import ProviderCustomerAccountDirectory, {
  type ProviderCustomerAccountDirectoryState,
} from '@/components/provider/provider-customer-account-directory';
import { logFailure } from '@/lib/operation-error';
import {
  listProviderCustomerAccounts,
  ProviderConsoleAccessError,
} from '@/services/provider-console';

export const dynamic = 'force-dynamic';

export default async function ProviderCustomerAccountsPage() {
  let state: ProviderCustomerAccountDirectoryState;
  try {
    const accounts = await listProviderCustomerAccounts();
    state = { kind: 'ready', accounts };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ProviderConsoleAccessError) {
      state = { kind: 'denied' };
    } else {
      logFailure('provider_customer_directory_load', error);
      state = { kind: 'unavailable' };
    }
  }
  return (
    <ProviderCustomerAccountDirectory
      accountHref={(accountId) => `/admin/provider/customers/${accountId}`}
      state={state}
      tenantsHref="/admin/provider"
    />
  );
}
