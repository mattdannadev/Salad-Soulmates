'use client';

import { useRef } from 'react';
import { useFormStatus } from 'react-dom';
import {
  Building2, PauseCircle, PlayCircle, Plus, X,
} from 'lucide-react';
import styles from './portal.module.css';

export type OrganizationStatus = 'active' | 'suspended';

export interface OrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: OrganizationStatus;
  enabledUserCount: number;
  createdAt: string;
}

export type OrganizationFormAction = (formData: FormData) => Promise<void>;

function SubmitButton({ label }: { label: string }) {
  const { pending } = useFormStatus();
  return <button disabled={pending} type="submit">{pending ? 'Saving…' : label}</button>;
}

export function CreateOrganizationControl({
  action = undefined,
}: {
  action?: OrganizationFormAction;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  return (
    <>
      <button
        className={styles.primaryAction}
        disabled={!action}
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        <Plus size={17} aria-hidden="true" />
        New organization
      </button>
      <dialog aria-labelledby="create-organization-title" className={styles.dialog} ref={dialog}>
        <div className={styles.dialogHeading}>
          <div>
            <p className={styles.kicker}>CONTROL PLANE</p>
            <h2 id="create-organization-title">New organization</h2>
          </div>
          <button
            aria-label="Close new organization form"
            className={styles.iconButton}
            onClick={() => dialog.current?.close()}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.dialogIntro}>Create a workspace identity for a new organization.</p>
        <form action={action} className={styles.form}>
          <label htmlFor="organization-name">Organization name</label>
          <input autoComplete="organization" id="organization-name" name="name" required type="text" />
          <label htmlFor="organization-slug">Registration slug</label>
          <input
            autoCapitalize="none"
            autoComplete="off"
            id="organization-slug"
            name="slug"
            pattern="[a-z0-9]+(?:-[a-z0-9]+)*"
            placeholder="example-company"
            required
            type="text"
          />
          <p className={styles.fieldHint}>Use lowercase letters, numbers, and single hyphens.</p>
          <label htmlFor="facility-name">First facility name</label>
          <input id="facility-name" name="facilityName" required type="text" />
          <label htmlFor="facility-timezone">Facility timezone</label>
          <input
            autoCapitalize="none"
            autoComplete="off"
            id="facility-timezone"
            name="timezone"
            placeholder="America/Chicago"
            required
            type="text"
          />
          <p className={styles.fieldHint}>Enter an IANA timezone, such as America/Chicago.</p>
          <div className={styles.dialogActions}>
            <button className={styles.cancelButton} onClick={() => dialog.current?.close()} type="button">
              Cancel
            </button>
            <SubmitButton label="Create organization" />
          </div>
        </form>
      </dialog>
    </>
  );
}

export function OrganizationStatusControl({
  action = undefined,
  organization,
}: {
  action?: OrganizationFormAction;
  organization: OrganizationSummary;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const isSuspended = organization.status === 'suspended';
  const verb = isSuspended ? 'Reactivate' : 'Suspend';
  const Icon = isSuspended ? PlayCircle : PauseCircle;
  const dialogId = `status-title-${organization.id}`;

  return (
    <>
      <button
        aria-label={`${verb} ${organization.name}`}
        className={styles.rowAction}
        disabled={!action}
        onClick={() => dialog.current?.showModal()}
        type="button"
      >
        <Icon size={15} aria-hidden="true" />
        {verb}
      </button>
      <dialog aria-labelledby={dialogId} className={styles.dialog} ref={dialog}>
        <div className={styles.dialogHeading}>
          <div>
            <p className={styles.kicker}>ORGANIZATION ACCESS</p>
            <h2 id={dialogId}>
              {verb}
              {' '}
              {organization.name}
              ?
            </h2>
          </div>
          <button
            aria-label={`Close ${verb.toLowerCase()} form`}
            className={styles.iconButton}
            onClick={() => dialog.current?.close()}
            type="button"
          >
            <X size={18} aria-hidden="true" />
          </button>
        </div>
        <p className={styles.dialogIntro}>
          {isSuspended
            ? 'Members will regain access according to their existing permissions.'
            : 'Members will lose access to this organization until it is reactivated.'}
        </p>
        <form action={action} className={styles.form}>
          <input name="organizationId" type="hidden" value={organization.id} />
          <input name="suspended" type="hidden" value={isSuspended ? 'false' : 'true'} />
          <label htmlFor={`reason-${organization.id}`}>Reason</label>
          <textarea id={`reason-${organization.id}`} name="reason" required rows={4} />
          <div className={styles.dialogActions}>
            <button className={styles.cancelButton} onClick={() => dialog.current?.close()} type="button">
              Cancel
            </button>
            <SubmitButton label={`${verb} organization`} />
          </div>
        </form>
      </dialog>
    </>
  );
}

export function EmptyOrganizations() {
  return (
    <div className={styles.emptyState}>
      <Building2 size={30} aria-hidden="true" />
      <strong>No organizations yet</strong>
      <p>Organizations will appear here after they are created.</p>
    </div>
  );
}
