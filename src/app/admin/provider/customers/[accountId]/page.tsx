import { notFound, unstable_rethrow } from 'next/navigation';
import ProviderCustomerAccountDetailView, {
  type ProviderCustomerAccountDetailState,
} from '@/components/provider/provider-customer-account-detail';
import { logFailure } from '@/lib/operation-error';
import {
  getProviderCustomerAccountDetail,
  ProviderConsoleAccessError,
  ProviderCustomerAccountNotFoundError,
} from '@/services/provider-console';

export const dynamic = 'force-dynamic';

export default async function ProviderCustomerAccountDetailPage({
  params,
}: {
  params: Promise<{ accountId: string }>;
}) {
  const { accountId } = await params;
  let state: ProviderCustomerAccountDetailState;
  try {
    const account = await getProviderCustomerAccountDetail(accountId);
    state = { kind: 'ready', account };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ProviderCustomerAccountNotFoundError) notFound();
    if (error instanceof ProviderConsoleAccessError) {
      state = { kind: 'denied' };
    } else {
      logFailure('provider_customer_load', error);
      state = { kind: 'unavailable' };
    }
  }
  return (
    <ProviderCustomerAccountDetailView
      backHref="/admin/provider/customers"
      state={state}
      tenantHref={(tenantId) => `/admin/provider/${tenantId}`}
    />
  );
}
