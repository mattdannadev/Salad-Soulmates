'use client';
import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { RecordForm } from './record-form';
import { saveRecord } from '@/app/actions';
import type { ReferenceOption, Permission, AccessProfile } from '@/domain/master-data';

export function ReferenceOptionForm({
  listCode,
  option,
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
        { name: 'list_code', label: 'List', type: 'hidden', value: listCode },
        {
          name: 'code',
          label: 'Stable code',
          value: option?.code ?? '',
          required: true,
          readOnly: Boolean(option) || !allowCustom,
          hint: 'Stored in records; labels may change safely.',
        },
        { name: 'label_en', label: 'English label', value: option?.label_en ?? '', required: true },
        { name: 'label_es', label: 'Spanish label', value: option?.label_es ?? '', required: true },
        {
          name: 'sort_order',
          label: 'Sort order',
          type: 'number',
          value: option?.sort_order ?? 0,
          min: 0,
          required: true,
        },
        { name: 'active', label: 'Active', type: 'checkbox', value: option?.active ?? true },
      ]}
    />
  );
}

export function AccessProfileForm({
  profile,
  permissions,
  selected = [],
}: {
  profile?: AccessProfile;
  permissions: Permission[];
  selected?: string[];
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
          const response = await saveRecord('access-profile', {
            id: profile?.id,
            name: String(form.get('name')),
            description: String(form.get('description')),
            base_role: String(form.get('base_role')),
            active: form.has('active'),
            permission_codes: form.getAll('permission_codes').map(String),
          });
          setResult(response);
          if (response.ok) router.refresh();
        });
      }}
    >
      <div className="form-grid">
        <label>
          Name
          <input name="name" defaultValue={profile?.name} required maxLength={100} />
        </label>
        <label>
          Workspace type
          <select name="base_role" defaultValue={profile?.base_role ?? 'reviewer'}>
            <option value="reviewer">Operations</option>
            <option value="worker">Production worker mobile</option>
            <option value="receiver">Receiving mobile</option>
          </select>
        </label>
        <label className="wide">
          Description
          <input name="description" defaultValue={profile?.description} maxLength={500} />
        </label>
        <label className="check">
          <span>Active</span>
          <input name="active" type="checkbox" defaultChecked={profile?.active ?? true} />
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
                {permission.area} · {permission.description}
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
      <button disabled={pending}>
        {pending ? 'Saving…' : profile ? 'Save profile' : 'Create profile'}
      </button>
    </form>
  );
}
