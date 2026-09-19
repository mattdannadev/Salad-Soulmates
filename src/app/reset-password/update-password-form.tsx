'use client';
import { useActionState } from 'react';
import { updatePassword } from '../actions';
export function UpdatePasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, { ok: false, message: '' });
  return (
    <form action={action} className="record-form">
      <label>
        New password
        <input
          name="password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
        />
      </label>
      <label>
        Confirm new password
        <input
          name="confirm_password"
          type="password"
          minLength={12}
          autoComplete="new-password"
          required
        />
      </label>
      {state.message && (
        <p role="alert" className="error-notice">
          {state.message}
        </p>
      )}
      <button disabled={pending}>{pending ? 'Updating…' : 'Update password'}</button>
    </form>
  );
}
