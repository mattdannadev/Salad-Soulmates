import { isConfigured } from '@/lib/supabase';
import { LoginForm } from './sign-in-form';
import Link from 'next/link';
import { Leaf } from 'lucide-react';
export default function Login() {
  return (
    <main className="login-page">
      <section className="login-card">
        <Leaf size={44} />
        <p className="eyebrow">SALAD SOULMATES</p>
        <h1>Bienvenido</h1>
        <p>
          Inicia sesión para comenzar.
          <br />
          Sign in to your workspace.
        </p>
        {isConfigured() ? (
          <LoginForm />
        ) : (
          <div className="notice">
            The database connection is not configured yet.{' '}
            <Link href="/setup">View setup status</Link>.
          </div>
        )}
      </section>
    </main>
  );
}
