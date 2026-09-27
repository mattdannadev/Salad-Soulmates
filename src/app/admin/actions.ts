'use server';

import { revalidatePath } from 'next/cache';
import { logFailure } from '@/lib/operation-error';
import { provisionOrganization, setOrganizationSuspended } from '@/services/platform-admin';

/**
 * Provisions a tenant through the platform-admin service. The service validates
 * the input and checks platform authority again before the privileged RPC runs.
 */
export async function createOrganization(formData: FormData): Promise<void> {
  try {
    await provisionOrganization(Object.fromEntries(formData));
  } catch (cause) {
    logFailure('platform_organization_create', cause);
    throw new Error('Could not create the organization. Review the details and try again.');
  }
  revalidatePath('/admin');
}

/** Changes organization availability without deleting its users or operational history. */
export async function changeOrganizationStatus(formData: FormData): Promise<void> {
  const suspended = formData.get('suspended');
  if (suspended !== 'true' && suspended !== 'false') {
    throw new Error('Invalid organization status request.');
  }
  try {
    await setOrganizationSuspended({
      organizationId: formData.get('organizationId'),
      suspended: suspended === 'true',
      reason: formData.get('reason'),
    });
  } catch (cause) {
    logFailure('platform_organization_status_change', cause);
    throw new Error('Could not update the organization. Review the reason and try again.');
  }
  revalidatePath('/admin');
}
