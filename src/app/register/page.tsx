import Link from 'next/link';
import { Leaf } from 'lucide-react';

export default function Register() {
  return (
    <main className="login-page">
      <section className="login-card auth-wide">
        <Leaf size={44} />
        <p className="eyebrow">SALAD SOULMATES</p>
        <h1>Organization link required</h1>
        <p>
          Ask your organization administrator for its account-request link. Each link sends your
          request only to that organization.
        </p>
        <div className="auth-links">
          <Link href="/login">Back to sign in</Link>
        </div>
      </section>
    </main>
  );
}
