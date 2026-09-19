import { Leaf } from 'lucide-react';
import { UpdatePasswordForm } from './update-password-form';
export default function ResetPassword() {
  return (
    <main className="login-page">
      <section className="login-card">
        <Leaf size={44} />
        <p className="eyebrow">SALAD SOULMATES</p>
        <h1>Choose a new password</h1>
        <p>Use at least 12 characters.</p>
        <UpdatePasswordForm />
      </section>
    </main>
  );
}
