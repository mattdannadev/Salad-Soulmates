'use client';

import { useActionState } from 'react';
import requestTenantAccess from './actions';

export default function RequestAccessForm({ organizationSlug }: { organizationSlug: string }) {
  const requestAccess = requestTenantAccess.bind(null, organizationSlug);
  const [state, action, pending] = useActionState(requestAccess, { ok: false, message: '' });
  return (
    <form action={action} className="record-form">
      <label>
        Full name
        <input name="display_name" autoComplete="name" required maxLength={120} />
      </label>
      <label>
        Primary work area
        <select name="requested_role" defaultValue="worker">
          <option value="worker">Production worker</option>
          <option value="receiver">Receiving</option>
          <option value="reviewer">Operations reviewer</option>
        </select>
      </label>
      <label>
        Email or mobile phone
        <input
          name="contact"
          autoComplete="email"
          required
          placeholder="name@company.com or +13125551234"
        />
      </label>
      <label>
        Preferred language
        <select name="preferred_locale" defaultValue="en">
          <option value="en">English</option>
          <option value="es">Español</option>
        </select>
      </label>
      <label className="honeypot" aria-hidden="true">
        Website
        <input name="website" tabIndex={-1} autoComplete="off" />
      </label>
      {state.message && (
        <p role={state.ok ? 'status' : 'alert'} className={state.ok ? 'notice' : 'error-notice'}>
          {state.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? 'Submitting…' : 'Submit request'}
      </button>
    </form>
  );
}
