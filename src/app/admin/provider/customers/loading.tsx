import ProviderCustomerAccountDirectory from '@/components/provider/provider-customer-account-directory';

export default function ProviderCustomerAccountsLoading() {
  return (
    <ProviderCustomerAccountDirectory
      accountHref={() => '/admin/provider/customers'}
      state={{ kind: 'loading' }}
      tenantsHref="/admin/provider"
    />
  );
}
