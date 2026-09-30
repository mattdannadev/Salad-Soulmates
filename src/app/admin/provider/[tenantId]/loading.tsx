import ProviderTenantDetail from '@/components/provider/provider-tenant-detail';

export default function ProviderTenantDetailLoading() {
  return <ProviderTenantDetail backHref="/admin/provider" state={{ kind: 'loading' }} />;
}
