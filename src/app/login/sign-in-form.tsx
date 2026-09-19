'use client';
import { useActionState } from 'react';
import { signIn } from '../actions';
export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { ok: false, message: '' });
  return (
    <form action={action} className="record-form">
      <label>
        Email or phone number
        <input name="identifier" type="text" autoComplete="username" required />
      </label>
      <label>
        Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.message && (
        <p role="alert" className="error-notice">
          {state.message}
        </p>
      )}
      <button disabled={pending}>{pending ? 'Signing in…' : 'Sign in'}</button>
    </form>
  );
}
