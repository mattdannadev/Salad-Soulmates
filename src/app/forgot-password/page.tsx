import Link from 'next/link';
import { Leaf } from 'lucide-react';
import { ForgotPasswordForm } from './reset-form';
export default function ForgotPassword() {
  return (
    <main className="login-page">
      <section className="login-card">
        <Leaf size={44} />
        <p className="eyebrow">SALAD SOULMATES</p>
        <h1>Reset your password</h1>
        <p>Enter the email address for your account. We’ll send you a secure reset link.</p>
        <ForgotPasswordForm />
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
