import Link from 'next/link';
import { requireProviderOwnerIdentity, ProviderFreshAuthError } from '@/services/provider-fresh-auth';
import ProviderPasswordForm from './password-form';

export const dynamic = 'force-dynamic';

export default async function ProviderReauthenticationPage() {
  let denied = false;
  try {
    await requireProviderOwnerIdentity();
  } catch (error) {
    if (!(error instanceof ProviderFreshAuthError)) throw error;
    denied = true;
  }
  return (
    <main className="login-page">
      <section className="login-card">
        <p className="eyebrow">PROVIDER CONSOLE</p>
        <h1>Confirm your password</h1>
        <p>Provider Owner changes require a password confirmation within the last 15 minutes.</p>
        {denied ? (
          <p role="alert">Sign in with a Provider Owner account to continue.</p>
        ) : <ProviderPasswordForm />}
        <Link href="/admin/provider">Back to Provider Console</Link>
      </section>
    </main>
  );
}
