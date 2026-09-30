'use client';

import { useActionState } from 'react';
import { confirmProviderOwnerPassword } from './actions';

export default function ProviderPasswordForm() {
  const [state, action, pending] = useActionState(confirmProviderOwnerPassword, {
    ok: false,
    message: '',
  });
  return (
    <form action={action} className="record-form">
      <label>
        Current password
        <input name="password" type="password" autoComplete="current-password" required />
      </label>
      {state.message && <p role={state.ok ? 'status' : 'alert'}>{state.message}</p>}
      <button type="submit" disabled={pending}>
        {pending ? 'Confirming…' : 'Confirm password'}
      </button>
    </form>
  );
}
