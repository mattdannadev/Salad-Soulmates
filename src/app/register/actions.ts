'use server';

import type { ActionResult } from '@/domain/master-data';
import { validateTenantSignupRequest } from '@/features/access/application/tenant-signup';
import createSupabaseTenantSignupRepository from '@/features/access/infrastructure/supabase-tenant-signup-repository';
import TenantSignupSubmissionError from '@/features/access/infrastructure/tenant-signup-submission-error';

export default async function requestTenantAccess(
  organizationSlug: string,
  _previous: ActionResult,
  form: FormData,
): Promise<ActionResult> {
  if (form.get('website')) return { ok: true, message: 'Request received.' };
  const validated = validateTenantSignupRequest(organizationSlug, form);
  if (!validated.ok) return validated;

  const repository = createSupabaseTenantSignupRepository();
  try {
    await repository.submitRequest(validated.request);
  } catch (error) {
    if (error instanceof TenantSignupSubmissionError) {
      if (error.reason === 'duplicate') {
        return {
          ok: true,
          message: 'A request for this email or phone number is already pending.',
        };
      }
      if (error.reason === 'unavailable') {
        return { ok: false, message: 'This account request link is no longer available.' };
      }
      if (error.reason === 'rate_limited') {
        return {
          ok: false,
          message: 'Too many account requests were submitted. Please try again in an hour.',
        };
      }
      return { ok: false, message: 'We could not submit your request. Please try again.' };
    }
    throw error;
  }
  return {
    ok: true,
    message: 'Request submitted. An administrator will contact you after reviewing access.',
  };
}
