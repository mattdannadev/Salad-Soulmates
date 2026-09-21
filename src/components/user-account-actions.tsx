'use client';

import {
  useActionState, useEffect, useRef, useState,
} from 'react';
import {
  deactivateManagedUser,
  generateUserPasswordResetLink,
  type UserManagementActionResult,
} from '@/app/user-management-actions';
import styles from './user-management.module.css';

const initialState: UserManagementActionResult = { ok: false, message: '' };

export default function UserAccountActions({
  userId,
  userName,
  active,
  isCurrentUser,
}: {
  userId: string;
  userName: string;
  active: boolean;
  isCurrentUser: boolean;
}) {
  const confirmation = useRef<HTMLDialogElement>(null);
  const [resetState, resetAction, resetting] = useActionState(
    generateUserPasswordResetLink,
    initialState,
  );
  const [deactivationState, deactivateAction, deactivating] = useActionState(
    deactivateManagedUser,
    initialState,
  );
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    if (deactivationState.ok) confirmation.current?.close();
  }, [deactivationState.ok]);

  async function copyResetLink() {
    if (!resetState.resetLink) return;
    try {
      await navigator.clipboard.writeText(resetState.resetLink);
      setCopyMessage('Reset link copied.');
    } catch {
      setCopyMessage('Copy failed. Select and copy the link manually.');
    }
  }

  return (
    <section className={`panel ${styles.securityPanel}`} aria-labelledby="user-security-heading">
      <h2 id="user-security-heading">Account security</h2>
      {active ? (
        <>
          <form action={resetAction} className={styles.actionBlock}>
            <input type="hidden" name="user_id" value={userId} />
            <div>
              <h3>Password reset</h3>
              <p>Create a one-time Supabase recovery link for this user.</p>
            </div>
            <button type="submit" className="secondary" disabled={resetting}>
              {resetting ? 'Creating link…' : 'Create password-reset link'}
            </button>
          </form>
          {resetState.message ? (
            <div
              className={resetState.ok ? 'notice' : 'error-notice'}
              role={resetState.ok ? 'status' : 'alert'}
            >
              <p>{resetState.message}</p>
              {resetState.resetLink ? (
                <div className={styles.resetLinkRow}>
                  <input
                    aria-label="Password-reset link"
                    readOnly
                    value={resetState.resetLink}
                    onFocus={(event) => event.currentTarget.select()}
                  />
                  <button
                    type="button"
                    className="secondary"
                    onClick={() => {
                      copyResetLink().catch(() => {
                        setCopyMessage('Copy failed. Select and copy the link manually.');
                      });
                    }}
                  >
                    Copy link
                  </button>
                </div>
              ) : null}
              {copyMessage ? <small role="status">{copyMessage}</small> : null}
            </div>
          ) : null}
          <div className={`${styles.actionBlock} ${styles.dangerBlock}`}>
            <div>
              <h3>Delete user</h3>
              <p>Remove app access while retaining the account and historical records.</p>
            </div>
            <button
              type="button"
              className={styles.dangerButton}
              disabled={isCurrentUser}
              onClick={() => confirmation.current?.showModal()}
            >
              Delete user
            </button>
            {isCurrentUser ? <small>You cannot deactivate your own access.</small> : null}
          </div>
        </>
      ) : (
        <p className="notice">This user is inactive. Password reset and deactivation are unavailable.</p>
      )}
      {deactivationState.ok && deactivationState.message ? (
        <p
          className="notice"
          role="status"
        >
          {deactivationState.message}
        </p>
      ) : null}
      <dialog
        ref={confirmation}
        className={styles.confirmation}
        aria-labelledby="delete-user-heading"
      >
        <form action={deactivateAction}>
          <input type="hidden" name="user_id" value={userId} />
          <h2 id="delete-user-heading">{`Delete ${userName}?`}</h2>
          <p>
            This deactivates and revokes Salad Soulmates access. It does not hard-delete the
            authentication account or historical work.
          </p>
          <label>
            Reason for deactivation
            <textarea name="reason" required minLength={3} maxLength={500} />
          </label>
          {!deactivationState.ok && deactivationState.message ? (
            <p className="error-notice" role="alert">{deactivationState.message}</p>
          ) : null}
          <div className={styles.dialogActions}>
            <button
              type="button"
              className="secondary"
              disabled={deactivating}
              onClick={() => confirmation.current?.close()}
            >
              Cancel
            </button>
            <button type="submit" className={styles.dangerButton} disabled={deactivating}>
              {deactivating ? 'Deactivating…' : 'Confirm delete'}
            </button>
          </div>
        </form>
      </dialog>
    </section>
  );
}
