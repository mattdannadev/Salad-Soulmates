'use client';

import {
  useId, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import type { ActionResult } from '@/domain/master-data';

export interface Field {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'date' | 'textarea' | 'select' | 'checkbox' | 'hidden';
  value?: string | number | boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  min?: number;
  step?: string;
  maxLength?: number;
  readOnly?: boolean;
  onChange?: (value: string) => void;
}
function fieldClass(type: Field['type']) {
  if (type === 'textarea') return 'wide';
  if (type === 'checkbox') return 'check';
  return '';
}
function fieldValue(field: Field, form: FormData): unknown {
  if (field.type === 'checkbox') return form.has(field.name);
  const value = form.get(field.name);
  if (field.type === 'number') return typeof value === 'string' && value.trim() ? Number(value) : null;
  return value ?? '';
}
export function FieldControl({ field, id }: { field: Field; id: string }) {
  if (field.type === 'select') {
    return (
      <select
        id={id}
        name={field.name}
        required={field.required}
        {...(field.onChange
          ? { value: String(field.value ?? '') }
          : { defaultValue: String(field.value ?? '') })}
        onChange={field.onChange ? (event) => field.onChange?.(event.target.value) : undefined}
      >
        {field.options?.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    );
  }
  if (field.type === 'textarea') {
    return (
      <textarea
        id={id}
        name={field.name}
        defaultValue={String(field.value ?? '')}
        rows={3}
        required={field.required}
        maxLength={field.maxLength ?? 2000}
      />
    );
  }
  if (field.type === 'checkbox') {
    return (
      <input id={id} name={field.name} type="checkbox" defaultChecked={Boolean(field.value)} />
    );
  }
  return (
    <input
      id={id}
      name={field.name}
      type={field.type ?? 'text'}
      {...(field.readOnly
        ? { value: String(field.value ?? '') }
        : { defaultValue: String(field.value ?? '') })}
      readOnly={field.readOnly}
      required={field.required}
      min={field.min}
      step={field.step ?? (field.type === 'number' ? '0.0001' : undefined)}
      maxLength={
        field.type === 'number' || field.type === 'date' ? undefined : (field.maxLength ?? 1000)
      }
    />
  );
}

export function RecordForm({
  kind,
  fields,
  submit = 'Save',
  afterSave = undefined,
  hidden = {},
  locale = 'en',
}: {
  kind: string;
  fields: Field[];
  submit?: string;
  afterSave?: string;
  hidden?: Record<string, unknown>;
  locale?: 'en' | 'es';
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const router = useRouter();
  const formId = useId();
  const receiptToken = useRef<string | undefined>(undefined);
  const savingLabel = locale === 'es' ? 'Guardando…' : 'Saving…';
  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const element = event.currentTarget;
        const form = new FormData(element);
        const values: Record<string, unknown> = { ...hidden };
        fields.forEach((field) => {
          values[field.name] = fieldValue(field, form);
        });
        if (kind === 'receipt') {
          receiptToken.current ??= crypto.randomUUID();
          values.request_id = receiptToken.current;
        }
        start(async () => {
          try {
            const response = await saveRecord(kind, values);
            setResult(response);
            if (response.ok) {
              if (kind === 'receipt') {
                receiptToken.current = undefined;
                element.reset();
              }
              if (afterSave) router.push(afterSave === 'detail' ? `/app/ingredients/${response.id}` : afterSave);
              router.refresh();
            }
          } catch {
            setResult({
              ok: false,
              message:
                locale === 'es'
                  ? 'No se pudo conectar. Intenta de nuevo.'
                  : 'Connection interrupted. Please try again.',
            });
          }
        });
      }}
    >
      <div className="form-grid">
        {fields.map((field) => {
          const id = `${formId}-${field.name}`;
          if (field.type === 'hidden') {
            return (
              <input key={id} type="hidden" name={field.name} value={String(field.value ?? '')} />
            );
          }
          return (
            <label key={id} className={fieldClass(field.type)} htmlFor={id}>
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              <FieldControl field={field} id={id} />
              {field.hint && <small>{field.hint}</small>}
            </label>
          );
        })}
      </div>
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'notice' : 'error-notice'}>
          {result.message}
        </p>
      )}
      <button type="submit" disabled={pending}>
        {pending ? savingLabel : submit}
      </button>
    </form>
  );
}
