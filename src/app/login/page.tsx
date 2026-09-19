import { isConfigured } from '@/lib/supabase';
import { LoginForm } from './sign-in-form';
import Link from 'next/link';
import { Leaf } from 'lucide-react';
export default async function Login({
  searchParams,
}: {
  searchParams: Promise<{ reset?: string }>;
}) {
  const { reset } = await searchParams;
  return (
    <main className="login-page">
      <section className="login-card">
        <Leaf size={44} />
        <p className="eyebrow">SALAD SOULMATES</p>
        <h1>Welcome</h1>
        <p>Sign in to your workspace.</p>
        {reset === 'success' && (
          <p className="notice">Your password was updated. Sign in with your new password.</p>
        )}
        {isConfigured() ? (
          <LoginForm />
        ) : (
          <div className="notice">
            The database connection is not configured yet.{' '}
            <Link href="/setup">View setup status</Link>.
          </div>
        )}
        <div className="auth-links">
          <Link href="/forgot-password">Forgot password?</Link>
          <Link href="/register">Request an account</Link>
        </div>
      </section>
    </main>
  );
}
