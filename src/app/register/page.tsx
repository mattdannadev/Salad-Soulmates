import Link from 'next/link';
import { Leaf } from 'lucide-react';
import RequestAccessForm from './request-access-form';

export default function Register() {
  return (
    <main className="login-page">
      <section className="login-card auth-wide">
        <Leaf size={44} />
        <p className="eyebrow">SALAD SOULMATES</p>
        <h1>Request an account</h1>
        <p>
          Use your work email or mobile phone number. An administrator will review your request and
          assign the right access.
        </p>
        <RequestAccessForm />
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
