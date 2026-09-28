'use client';

import { useActionState } from 'react';
import { ShieldCheck, Sparkles } from 'lucide-react';
import {
  setOperationsCopilotProfileDefault,
  setOperationsCopilotUserOverride,
  type CopilotAccessActionResult,
} from '@/app/operations-copilot-access-actions';
import styles from './operations-copilot-access.module.css';

const initialState: CopilotAccessActionResult = { ok: false, message: '' };

export function CopilotProfileAccess({
  accessProfileId,
  enabled,
  planEnabled,
}: {
  accessProfileId: string;
  enabled: boolean;
  planEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    setOperationsCopilotProfileDefault,
    initialState,
  );
  return (
    <form action={action} className={styles.control}>
      <input type="hidden" name="access_profile_id" value={accessProfileId} />
      <div className={styles.copy}>
        <span className={styles.icon}><Sparkles size={17} aria-hidden /></span>
        <div>
          <strong>Operations Copilot default</strong>
          <p>
            New and existing users on this profile inherit this setting unless they have an
            individual override.
          </p>
          {!planEnabled ? (
            <small>
              The organization plan is off, so access remains blocked until it is enabled.
            </small>
          ) : null}
        </div>
      </div>
      <div className={styles.formRow}>
        <label>
          Profile default
          <select name="enabled" defaultValue={String(enabled)} disabled={pending}>
            <option value="false">Off — deny access</option>
            <option value="true">On — allow eligible users</option>
          </select>
        </label>
        <button type="submit" className="secondary" disabled={pending}>
          {pending ? 'Saving…' : 'Save Copilot default'}
        </button>
      </div>
      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      ) : null}
    </form>
  );
}

export function CopilotUserAccess({
  userId,
  override,
  profileDefault,
  planEnabled,
}: {
  userId: string;
  override: boolean | null;
  profileDefault: boolean;
  planEnabled: boolean;
}) {
  const [state, action, pending] = useActionState(
    setOperationsCopilotUserOverride,
    initialState,
  );
  let current = 'inherit';
  if (override !== null) current = override ? 'enabled' : 'disabled';
  const effective = planEnabled && (override ?? profileDefault);
  return (
    <section className={`panel ${styles.userPanel}`} aria-labelledby="copilot-access-heading">
      <div className={styles.panelHeading}>
        <span className={styles.heroIcon}><ShieldCheck size={22} aria-hidden /></span>
        <div>
          <p className={styles.eyebrow}>AUDITED ACCESS CONTROL</p>
          <h2 id="copilot-access-heading">Operations Copilot access</h2>
          <p>
            Choose whether this user inherits the profile default or receives an explicit
            exception. Copilot remains read-only after access is granted.
          </p>
        </div>
        <span className={effective ? styles.allowed : styles.blocked}>
          {effective ? 'Effective access: On' : 'Effective access: Off'}
        </span>
      </div>
      <form action={action} className={styles.userForm}>
        <input type="hidden" name="user_id" value={userId} />
        <label>
          User setting
          <select name="access" defaultValue={current} disabled={pending}>
            <option value="inherit">
              {`Inherit profile default (${profileDefault ? 'On' : 'Off'})`}
            </option>
            <option value="enabled">Explicitly enable</option>
            <option value="disabled">Explicitly disable</option>
          </select>
        </label>
        <button type="submit" disabled={pending}>
          {pending ? 'Saving audited change…' : 'Save Copilot access'}
        </button>
      </form>
      {!planEnabled ? (
        <p className={styles.planNote}>
          The organization plan is currently off. This setting is saved, but access remains
          blocked until the plan is enabled.
        </p>
      ) : null}
      {state.message ? (
        <p className={state.ok ? styles.success : styles.error} role={state.ok ? 'status' : 'alert'}>
          {state.message}
        </p>
      ) : null}
    </section>
  );
}
