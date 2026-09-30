import ProviderCustomerAccountDetailView from '@/components/provider/provider-customer-account-detail';

export default function ProviderCustomerAccountDetailLoading() {
  return (
    <ProviderCustomerAccountDetailView
      backHref="/admin/provider/customers"
      state={{ kind: 'loading' }}
      tenantHref={() => '/admin/provider'}
    />
  );
}
