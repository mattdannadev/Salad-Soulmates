import { unstable_rethrow } from 'next/navigation';
import ProviderDirectory, { type ProviderDirectoryState } from '@/components/provider/provider-directory';
import { logFailure } from '@/lib/operation-error';
import { listProviderTenants, ProviderConsoleAccessError } from '@/services/provider-console';

export const dynamic = 'force-dynamic';

export default async function ProviderConsolePage() {
  let state: ProviderDirectoryState;
  try {
    const tenants = await listProviderTenants();
    state = { kind: 'ready', tenants };
  } catch (error) {
    unstable_rethrow(error);
    if (error instanceof ProviderConsoleAccessError) {
      state = { kind: 'denied' };
    } else {
      logFailure('provider_directory_load', error);
      state = { kind: 'unavailable' };
    }
  }
  return <ProviderDirectory state={state} />;
}
