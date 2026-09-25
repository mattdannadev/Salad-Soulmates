import 'server-only';
import { z } from 'zod';
import type {
  SignupOrganization,
  TenantSignupRepository,
  TenantSignupRequest,
} from '@/features/access/application/tenant-signup';
import { logFailure } from '@/lib/operation-error';
import { supabase } from '@/lib/supabase';
import TenantSignupSubmissionError from './tenant-signup-submission-error';

const signupOrganizationSchema = z.object({
  name: z.string().trim().min(1).max(200),
  slug: z.string().trim().min(1).max(63),
});

/** Supabase adapter for the narrow, tenant-safe public signup RPCs. */
export default function createSupabaseTenantSignupRepository(): TenantSignupRepository {
  return {
    async findOrganization(tenantSlug: string): Promise<SignupOrganization | null> {
      const db = await supabase();
      const { data, error } = await db
        .rpc('resolve_signup_organization', { tenant_slug: tenantSlug })
        .maybeSingle();
      if (error) {
        logFailure('signup_organization_lookup', error);
        throw new Error('Unable to load the signup organization.', { cause: error });
      }
      if (!data) return null;
      const organization = signupOrganizationSchema.safeParse(data);
      if (!organization.success || organization.data.slug !== tenantSlug) {
        logFailure('signup_organization_lookup', { code: 'INVALID_RESPONSE' });
        throw new Error('Unable to load the signup organization.');
      }
      return organization.data;
    },

    async submitRequest(request: TenantSignupRequest): Promise<void> {
      const db = await supabase({ readOnly: false });
      const { error } = await db.rpc('submit_access_request', {
        tenant_slug: request.tenantSlug,
        display_name: request.displayName,
        contact_kind: request.contactKind,
        contact_value: request.contactValue,
        preferred_locale: request.preferredLocale,
        requested_role: request.requestedRole,
      });
      if (!error) return;
      if (error.code === '23505') throw new TenantSignupSubmissionError('duplicate');
      if (error.code === 'P0001') throw new TenantSignupSubmissionError('rate_limited');
      if (error.code === 'P0002') throw new TenantSignupSubmissionError('unavailable');
      logFailure('signup_request_submit', error);
      throw new TenantSignupSubmissionError('unexpected', { cause: error });
    },
  };
}
