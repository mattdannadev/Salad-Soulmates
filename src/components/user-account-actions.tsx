'use client';

import {
  useActionState, useEffect, useRef, useState,
} from 'react';
import {
  deactivateManagedUser,
  reactivateManagedUser,
  changeManagedUserAccessProfile,
  generateUserPasswordResetLink,
  type UserManagementActionResult,
} from '@/app/user-management-actions';
import { useRouter } from 'next/navigation';
import type { AccessProfileOption } from '@/lib/user-management-data';
import ActionButton from './action-button';
import FormFooter from './form-footer';
import styles from './user-management.module.css';

const initialState: UserManagementActionResult = { ok: false, message: '' };

/** Keep a submitted deactivation dialog open until the server action settles. */
export function preventPendingDeactivationCancel(
  event: { preventDefault: () => void },
  pending: boolean,
): void {
  if (pending) event.preventDefault();
}

export default function UserAccountActions({
  userId,
  userName,
  active,
  isCurrentUser,
  currentAccessProfileId,
  accessProfiles,
  returnHref,
}: {
  userId: string;
  userName: string;
  active: boolean;
  isCurrentUser: boolean;
  currentAccessProfileId: string;
  accessProfiles: AccessProfileOption[];
  returnHref: string;
}) {
  const router = useRouter();
  const hasCurrentAccessProfile = accessProfiles.some(
    (profile) => profile.id === currentAccessProfileId,
  );
  const confirmation = useRef<HTMLDialogElement>(null);
  const [resetState, resetAction, resetting] = useActionState(
    generateUserPasswordResetLink,
    initialState,
  );
  const [deactivationState, deactivateAction, deactivating] = useActionState(
    deactivateManagedUser,
    initialState,
  );
  const [reactivationState, reactivateAction, reactivating] = useActionState(
    reactivateManagedUser,
    initialState,
  );
  const [accessProfileState, changeAccessProfile, changingAccessProfile] = useActionState(
    changeManagedUserAccessProfile,
    initialState,
  );
  const [copyMessage, setCopyMessage] = useState('');

  useEffect(() => {
    if (reactivationState.ok) {
      router.replace(returnHref);
      router.refresh();
    }
  }, [reactivationState.ok, returnHref, router]);

  useEffect(() => {
    if (deactivationState.ok) {
      confirmation.current?.close();
      router.replace(returnHref);
      router.refresh();
    }
  }, [deactivationState.ok, returnHref, router]);

  useEffect(() => {
    if (accessProfileState.ok) {
      router.replace(returnHref);
      router.refresh();
    }
  }, [accessProfileState.ok, returnHref, router]);

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
        <form action={changeAccessProfile} className={styles.actionBlock}>
          <input type="hidden" name="user_id" value={userId} />
          <div>
            <h3>Access profile</h3>
            <p>Change the permissions assigned to this user.</p>
          </div>
          <label>
            Access profile
            <select
              name="access_profile_id"
              defaultValue={hasCurrentAccessProfile ? currentAccessProfileId : ''}
              required
              disabled={changingAccessProfile}
            >
              {!hasCurrentAccessProfile ? (
                <option value="" disabled>Choose an active replacement profile</option>
              ) : null}
              {accessProfiles.map((profile) => (
                <option key={profile.id} value={profile.id}>{profile.name}</option>
              ))}
            </select>
          </label>
          <FormFooter
            submitLabel="Save access profile"
            cancelLabel="Cancel"
            cancelHref={returnHref}
            pending={changingAccessProfile}
            pendingLabel="Saving…"
            feedback={!accessProfileState.ok && accessProfileState.message
              ? { kind: 'error', message: accessProfileState.message }
              : undefined}
          />
        </form>
      ) : null}
      {active ? (
        <>
          <form action={resetAction} className={styles.actionBlock}>
            <input type="hidden" name="user_id" value={userId} />
            <div>
              <h3>Password reset</h3>
              <p>Create a one-time password-reset link for this user.</p>
            </div>
            <ActionButton
              type="submit"
              variant="secondary"
              pending={resetting}
              pendingLabel="Creating link…"
            >
              Create password-reset link
            </ActionButton>
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
                  <ActionButton
                    type="button"
                    variant="secondary"
                    onClick={() => {
                      copyResetLink().catch(() => {
                        setCopyMessage('Copy failed. Select and copy the link manually.');
                      });
                    }}
                  >
                    Copy link
                  </ActionButton>
                </div>
              ) : null}
              {copyMessage ? <small role="status">{copyMessage}</small> : null}
            </div>
          ) : null}
          <div className={`${styles.actionBlock} ${styles.dangerBlock}`}>
            <div>
              <h3>Deactivate user</h3>
              <p>Remove app access while retaining the account and historical records.</p>
            </div>
            <ActionButton
              type="button"
              variant="destructive"
              disabled={isCurrentUser}
              onClick={() => confirmation.current?.showModal()}
            >
              Deactivate user
            </ActionButton>
            {isCurrentUser ? <small>You cannot deactivate your own access.</small> : null}
          </div>
        </>
      ) : (
        <form action={reactivateAction} className={styles.actionBlock}>
          <input type="hidden" name="user_id" value={userId} />
          <div>
            <h3>Reactivate user</h3>
            <p>
              Restore this user&apos;s existing Salad Soulmates access and retain their account
              history.
            </p>
          </div>
          <ActionButton
            type="submit"
            variant="secondary"
            pending={reactivating}
            pendingLabel="Reactivating…"
          >
            Reactivate user
          </ActionButton>
          {reactivationState.message ? (
            <p className={reactivationState.ok ? 'notice' : 'error-notice'} role={reactivationState.ok ? 'status' : 'alert'}>
              {reactivationState.message}
            </p>
          ) : null}
        </form>
      )}
      {deactivationState.ok && deactivationState.message ? (
        <p
          className="notice"
          role="status"
        >
          {deactivationState.message}
        </p>
      ) : null}
      {active && !isCurrentUser ? (
        <dialog
          ref={confirmation}
          className={styles.confirmation}
          aria-labelledby="deactivate-user-heading"
          aria-describedby="deactivate-user-description"
          onCancel={(event) => preventPendingDeactivationCancel(event, deactivating)}
        >
          <form action={deactivateAction}>
            <input type="hidden" name="user_id" value={userId} />
            <h2 id="deactivate-user-heading">{`Deactivate ${userName}?`}</h2>
            <p id="deactivate-user-description">
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
              <ActionButton
                type="submit"
                variant="destructive"
                pending={deactivating}
                pendingLabel="Deactivating…"
              >
                Deactivate user
              </ActionButton>
            </div>
          </form>
        </dialog>
      ) : null}
    </section>
  );
}
