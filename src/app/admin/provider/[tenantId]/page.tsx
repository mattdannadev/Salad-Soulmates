import { notFound } from 'next/navigation';
import ProviderTenantDetail from '@/components/provider/provider-tenant-detail';
import {
  getProviderTenantDetail,
  ProviderConsoleAccessError,
  ProviderTenantNotFoundError,
} from '@/services/provider-console';

export const dynamic = 'force-dynamic';

export default async function ProviderTenantDetailPage({
  params,
}: {
  params: Promise<{ tenantId: string }>;
}) {
  const { tenantId } = await params;
  try {
    const tenant = await getProviderTenantDetail(tenantId);
    return <ProviderTenantDetail
      backHref="/admin/provider"
      customerHref={(accountId) => `/admin/provider/customers/${accountId}`}
      state={{ kind: 'ready', tenant }}
    />;
  } catch (error) {
    if (error instanceof ProviderConsoleAccessError) {
      return <ProviderTenantDetail backHref="/admin/provider" state={{ kind: 'denied' }} />;
    }
    if (error instanceof ProviderTenantNotFoundError) notFound();
    return <ProviderTenantDetail backHref="/admin/provider" state={{ kind: 'unavailable' }} />;
  }
}
