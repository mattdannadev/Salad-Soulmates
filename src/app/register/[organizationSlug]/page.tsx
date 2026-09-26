import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { notFound } from 'next/navigation';
import { findSignupOrganization } from '@/features/access/application/tenant-signup';
import createSupabaseTenantSignupRepository from '@/features/access/infrastructure/supabase-tenant-signup-repository';
import RequestAccessForm from '../request-access-form';

export const dynamic = 'force-dynamic';

export default async function TenantRegister({
  params,
}: PageProps<'/register/[organizationSlug]'>) {
  const { organizationSlug } = await params;
  const organization = await findSignupOrganization(
    createSupabaseTenantSignupRepository(),
    organizationSlug,
  );
  if (!organization) notFound();

  return (
    <main className="login-page">
      <section className="login-card auth-wide">
        <Leaf size={44} />
        <p className="eyebrow">{organization.name}</p>
        <h1>Request an account</h1>
        <p>
          Use your work email or mobile phone number. An administrator at
          {' '}
          {organization.name}
          {' '}
          will review your request and assign the right access.
        </p>
        <RequestAccessForm organizationSlug={organization.slug} />
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
