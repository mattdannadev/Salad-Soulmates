'use client';

import { useActionState } from 'react';
import { requestPasswordReset } from '../actions';

export default function ForgotPasswordForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, { ok: false, message: '' });
  return (
    <form action={action} className="record-form">
      <label>
        Email address
        <input name="email" type="email" autoComplete="email" required />
      </label>
      {state.message && (
        <p role="status" className={state.ok ? 'notice' : 'error-notice'}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Sending…' : 'Send reset link'}
      </button>
    </form>
  );
}
