import { notFound } from 'next/navigation';
import ProviderCustomerAccountDetailView from '@/components/provider/provider-customer-account-detail';
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
  try {
    const account = await getProviderCustomerAccountDetail(accountId);
    return (
      <ProviderCustomerAccountDetailView
        backHref="/admin/provider/customers"
        state={{ kind: 'ready', account }}
        tenantHref={(tenantId) => `/admin/provider/${tenantId}`}
      />
    );
  } catch (error) {
    if (error instanceof ProviderConsoleAccessError) {
      return (
        <ProviderCustomerAccountDetailView
          backHref="/admin/provider/customers"
          state={{ kind: 'denied' }}
          tenantHref={() => '/admin/provider'}
        />
      );
    }
    if (error instanceof ProviderCustomerAccountNotFoundError) notFound();
    return (
      <ProviderCustomerAccountDetailView
        backHref="/admin/provider/customers"
        state={{ kind: 'unavailable' }}
        tenantHref={() => '/admin/provider'}
      />
    );
  }
}
