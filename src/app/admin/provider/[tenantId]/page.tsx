import { notFound, unstable_rethrow } from 'next/navigation';
import ProviderTenantDetail, {
  type ProviderTenantDetailState,
} from '@/components/provider/provider-tenant-detail';
import { logFailure } from '@/lib/operation-error';
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
  let state: ProviderTenantDetailState;
  try {
    const tenant = await getProviderTenantDetail(tenantId);
    state = { kind: 'ready', tenant };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ProviderTenantNotFoundError) notFound();
    if (error instanceof ProviderConsoleAccessError) {
      state = { kind: 'denied' };
    } else {
      logFailure('provider_tenant_load', error);
      state = { kind: 'unavailable' };
    }
  }
  return (
    <ProviderTenantDetail
      backHref="/admin/provider"
      customerHref={(accountId) => `/admin/provider/customers/${accountId}`}
      state={state}
    />
  );
}
