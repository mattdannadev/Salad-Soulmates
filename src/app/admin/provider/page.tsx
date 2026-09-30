import ProviderDirectory from '@/components/provider/provider-directory';
import { listProviderTenants, ProviderConsoleAccessError } from '@/services/provider-console';

export const dynamic = 'force-dynamic';

export default async function ProviderConsolePage() {
  try {
    const tenants = await listProviderTenants();
    return <ProviderDirectory state={{ kind: 'ready', tenants }} />;
  } catch (error) {
    if (error instanceof ProviderConsoleAccessError) {
      return <ProviderDirectory state={{ kind: 'denied' }} />;
    }
    return <ProviderDirectory state={{ kind: 'unavailable' }} />;
  }
}
