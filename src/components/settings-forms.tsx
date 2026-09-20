'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
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
        {pending ? 'Saving…' : lockProfile ? 'Save access areas' : (profile && 'Save profile') || 'Create profile'}
      </button>
    </form>
  );
}
