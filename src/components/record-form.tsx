'use client';
import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { saveRecord } from '@/app/actions';
import type { ActionResult } from '@/domain/master-data';

export type Field = {
  name: string;
  label: string;
  type?: 'text' | 'email' | 'number' | 'textarea' | 'select' | 'checkbox' | 'hidden';
  value?: string | number | boolean;
  required?: boolean;
  options?: { value: string; label: string }[];
  hint?: string;
  min?: number;
  step?: string;
};
export function RecordForm({
  kind,
  fields,
  submit = 'Save',
  afterSave,
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
  return (
    <form
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        const values: Record<string, unknown> = { ...hidden };
        for (const field of fields)
          values[field.name] =
            field.type === 'checkbox'
              ? form.has(field.name)
              : field.type === 'number'
                ? Number(form.get(field.name))
                : String(form.get(field.name) ?? '');
        start(async () => {
          try {
            const response = await saveRecord(kind, values);
            setResult(response);
            if (response.ok) {
              if (afterSave)
                router.push(afterSave === 'detail' ? `/app/ingredients/${response.id}` : afterSave);
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
      className="record-form"
    >
      <div className="form-grid">
        {fields.map((field) => {
          const id = `${formId}-${field.name}`;
          if (field.type === 'hidden')
            return (
              <input key={id} type="hidden" name={field.name} value={String(field.value ?? '')} />
            );
          return (
            <label
              key={id}
              className={
                field.type === 'textarea' ? 'wide' : field.type === 'checkbox' ? 'check' : ''
              }
              htmlFor={id}
            >
              <span>
                {field.label}
                {field.required ? ' *' : ''}
              </span>
              {field.type === 'select' ? (
                <select
                  id={id}
                  name={field.name}
                  defaultValue={String(field.value ?? '')}
                  required={field.required}
                >
                  {field.options?.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              ) : field.type === 'textarea' ? (
                <textarea
                  id={id}
                  name={field.name}
                  defaultValue={String(field.value ?? '')}
                  rows={3}
                  required={field.required}
                  maxLength={2000}
                />
              ) : field.type === 'checkbox' ? (
                <input
                  id={id}
                  name={field.name}
                  type="checkbox"
                  defaultChecked={Boolean(field.value)}
                />
              ) : (
                <input
                  id={id}
                  name={field.name}
                  type={field.type ?? 'text'}
                  defaultValue={String(field.value ?? '')}
                  required={field.required}
                  min={field.min}
                  step={field.step ?? (field.type === 'number' ? '0.0001' : undefined)}
                  maxLength={field.type === 'number' ? undefined : 1000}
                />
              )}
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
        {pending ? (locale === 'es' ? 'Guardando…' : 'Saving…') : submit}
      </button>
    </form>
  );
}
