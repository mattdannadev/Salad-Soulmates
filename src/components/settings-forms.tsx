'use client';

import { useActionState, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { inviteUserFromSettings, saveRecord } from '@/app/actions';
import type { ReferenceOption, Permission, AccessProfile } from '@/domain/master-data';
import { RecordForm } from './record-form';

export function ReferenceOptionForm({
  listCode,
  option = undefined,
  allowCustom,
}: {
  listCode: string;
  option?: ReferenceOption;
  allowCustom: boolean;
}) {
  return (
    <RecordForm
      kind="reference-option"
      submit={option ? 'Save value' : 'Add value'}
      hidden={{ id: option?.id }}
      fields={[
        {
          name: 'list_code',
          label: 'List',
          type: 'hidden',
          value: listCode,
        },
        {
          name: 'code',
          label: 'Stable code',
          value: option?.code ?? '',
          required: true,
          readOnly: Boolean(option) || !allowCustom,
          hint: 'Stored in records; labels may change safely.',
        },
        {
          name: 'label_en',
          label: 'English label',
          value: option?.label_en ?? '',
          required: true,
        },
        {
          name: 'label_es',
          label: 'Spanish label',
          value: option?.label_es ?? '',
          required: true,
        },
        {
          name: 'sort_order',
          label: 'Sort order',
          type: 'number',
          value: option?.sort_order ?? 0,
          min: 0,
          required: true,
        },
        {
          name: 'active',
          label: 'Active',
          type: 'checkbox',
          value: option?.active ?? true,
        },
      ]}
    />
  );
}

export function AccessProfileForm({
  profile = undefined,
  permissions,
  selected = [],
  lockProfile = false,
}: {
  profile?: AccessProfile;
  permissions: Permission[];
  selected?: string[];
  lockProfile?: boolean;
}) {
  const [result, setResult] = useState<{ ok: boolean; message: string }>();
  const [pending, start] = useTransition();
  const router = useRouter();
  let submitLabel = 'Create profile';
  if (profile) submitLabel = 'Save profile';
  if (lockProfile) submitLabel = 'Save access areas';
  if (pending) submitLabel = 'Saving…';
  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        start(async () => {
          try {
            const response = await saveRecord('access-profile', {
              id: profile?.id,
              name: form.get('name'),
              description: form.get('description'),
              base_role: lockProfile ? profile?.base_role : form.get('base_role'),
              active: lockProfile ? profile?.active ?? true : form.has('active'),
              permission_codes: form.getAll('permission_codes').map(String),
            });
            setResult(response);
            if (response.ok) router.refresh();
          } catch {
            setResult({ ok: false, message: 'Unable to connect. Please try again.' });
          }
        });
      }}
    >
      <div className="form-grid">
        <label>
          Name
          <input name="name" defaultValue={profile?.name} required maxLength={100} readOnly={lockProfile} />
        </label>
        <label>
          Workspace type
          <select name="base_role" defaultValue={profile?.base_role ?? 'reviewer'} disabled={lockProfile}>
            <option value="reviewer">Operations</option>
            <option value="worker">Production worker mobile</option>
            <option value="receiver">Receiving mobile</option>
          </select>
        </label>
        <label className="wide">
          Description
          <input name="description" defaultValue={profile?.description} maxLength={500} readOnly={lockProfile} />
        </label>
        <label className="check">
          <span>Active</span>
          <input name="active" type="checkbox" defaultChecked={profile?.active ?? true} disabled={lockProfile} />
        </label>
      </div>
      <fieldset className="permission-grid">
        <legend>Allowed actions</legend>
        {permissions.map((permission) => (
          <label className="check" key={permission.code}>
            <input
              type="checkbox"
              name="permission_codes"
              value={permission.code}
              defaultChecked={selected.includes(permission.code)}
            />
            <span>
              <strong>{permission.label}</strong>
              <small>
                {permission.area}
                {' '}
                ·
                {permission.description}
              </small>
            </span>
          </label>
        ))}
      </fieldset>
      {result ? (
        <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'notice' : 'error-notice'}>
          {result.message}
        </p>
      ) : null}
      <button type="submit" disabled={pending}>
        {submitLabel}
      </button>
    </form>
  );
}

interface InviteFacility {
  id: string;
  name: string;
}

interface InviteProfile {
  id: string;
  name: string;
  base_role: string;
}

export function InviteUserForm({
  facilities,
  profiles,
}: {
  facilities: InviteFacility[];
  profiles: InviteProfile[];
}) {
  const [state, action, pending] = useActionState(inviteUserFromSettings, { ok: false, message: '' });
  const [name, setName] = useState('New teammate');
  const [profileId, setProfileId] = useState(profiles[0]?.id ?? '');
  const selectedProfile = profiles.find((profile) => profile.id === profileId);
  return (
    <div className="invite-user-layout">
      <form action={action} className="record-form">
        <div className="form-grid">
          <label>
            Full name
            <input name="display_name" required maxLength={120} onChange={(event) => setName(event.target.value)} />
          </label>
          <label>
            Work email
            <input name="email" type="email" autoComplete="email" required maxLength={254} />
            <small>Each teammate needs a unique email address for the standard sign-in page.</small>
          </label>
          <label>
            Facility
            <select name="facility_id" required defaultValue={facilities[0]?.id}>
              {facilities.map((facility) => (
                <option key={facility.id} value={facility.id}>
                  {facility.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Access profile
            <select
              name="access_profile_id"
              required
              value={profileId}
              onChange={(event) => setProfileId(event.target.value)}
            >
              {profiles.map((profile) => (
                <option key={profile.id} value={profile.id}>
                  {profile.name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Default language
            <select name="preferred_locale" defaultValue="en">
              <option value="en">English</option>
              <option value="es">Español</option>
            </select>
          </label>
        </div>
        {state.message ? <p role={state.ok ? 'status' : 'alert'} className={state.ok ? 'notice' : 'error-notice'}>{state.message}</p> : null}
        <button type="submit" disabled={pending || !facilities.length || !profiles.length}>
          {pending ? 'Sending invitation…' : 'Create user & send setup email'}
        </button>
      </form>
      <aside className="invite-email-preview" aria-label="Invitation email preview">
        <p className="eyebrow">EMAIL PREVIEW</p>
        <div className="email-preview-card">
          <p className="email-brand">Salad Soulmates</p>
          <h3>You&apos;re invited</h3>
          <p>
            Hi
            {' '}
            {name.trim() || 'there'}
            ,
          </p>
          <p>
            Your access to Salad Soulmates is ready
            {selectedProfile ? ` with the ${selectedProfile.name} profile` : ''}
            .
          </p>
          <a href="#set-up-your-account">Set up your account</a>
          <p className="email-preview-note">This secure, one-time link lets you set your password and sign in.</p>
        </div>
        <p className="hint">The delivered message is sent by Supabase Auth; this preview is the approved branded copy for its invitation template.</p>
      </aside>
    </div>
  );
}
