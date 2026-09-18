'use client';
import { useActionState } from 'react';
import { signIn } from '../actions';
export function LoginForm() {
  const [state, action, pending] = useActionState(signIn, { ok: false, message: '' });
  return (
    <form action={action} className="record-form">
      <label>
        Correo / Email
        <input name="email" type="email" autoComplete="username" required />
      </label>
      <label>
        Contraseña / Password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.message && (
        <p role="alert" className="error-notice">
          {state.message}
        </p>
      )}
      <button disabled={pending}>{pending ? 'Conectando…' : 'Iniciar sesión / Sign in'}</button>
    </form>
  );
}
