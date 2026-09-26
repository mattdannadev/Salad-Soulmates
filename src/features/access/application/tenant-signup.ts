import { z } from 'zod';

export const tenantSlugSchema = z
  .string()
  .trim()
  .min(1)
  .max(63)
  .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/);

const tenantSignupFormSchema = z.object({
  display_name: z.string().trim().min(2).max(120),
  contact: z.string().trim().min(5).max(254),
  preferred_locale: z.enum(['en', 'es']),
  requested_role: z.enum(['reviewer', 'worker', 'receiver']),
});

export interface SignupOrganization {
  name: string;
  slug: string;
}

export interface TenantSignupRequest {
  tenantSlug: string;
  displayName: string;
  contactKind: 'email' | 'phone';
  contactValue: string;
  preferredLocale: 'en' | 'es';
  requestedRole: 'reviewer' | 'worker' | 'receiver';
}

export interface TenantSignupRepository {
  findOrganization(tenantSlug: string): Promise<SignupOrganization | null>;
  submitRequest(request: TenantSignupRequest): Promise<void>;
}

export type TenantSignupValidation = | { ok: true; request: TenantSignupRequest }
  | { ok: false; message: string };

/** Validates the tenant URL and public form fields before infrastructure is called. */
export function validateTenantSignupRequest(
  rawTenantSlug: string,
  form: FormData,
): TenantSignupValidation {
  const tenantSlug = tenantSlugSchema.safeParse(rawTenantSlug);
  const fields = tenantSignupFormSchema.safeParse(Object.fromEntries(form));
  if (!tenantSlug.success || !fields.success) {
    return { ok: false, message: 'Enter your name and a valid email or phone number.' };
  }

  const isEmail = z.email().safeParse(fields.data.contact).success;
  const phone = fields.data.contact.replace(/[\s().-]/g, '');
  const isPhone = /^\+[1-9]\d{7,14}$/.test(phone);
  if (!isEmail && !isPhone) {
    return {
      ok: false,
      message: 'Use a valid email or a phone number with country code, such as +13125551234.',
    };
  }

  return {
    ok: true,
    request: {
      tenantSlug: tenantSlug.data,
      displayName: fields.data.display_name,
      contactKind: isEmail ? 'email' : 'phone',
      contactValue: isEmail ? fields.data.contact.toLowerCase() : phone,
      preferredLocale: fields.data.preferred_locale,
      requestedRole: fields.data.requested_role,
    },
  };
}

/** Resolves the public organization label without exposing its internal identifier. */
export async function findSignupOrganization(
  repository: TenantSignupRepository,
  rawTenantSlug: string,
) {
  const tenantSlug = tenantSlugSchema.safeParse(rawTenantSlug);
  if (!tenantSlug.success) return null;
  return repository.findOrganization(tenantSlug.data);
}
