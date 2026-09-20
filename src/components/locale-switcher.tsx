'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { setPreferredLocale } from '@/app/actions';
import { logFailure } from '@/lib/operation-error';

/** Capture the changed value before React restores a controlled select's saved value. */
export default function LocaleSwitcher({ locale }: { locale: 'en' | 'es' }) {
  const [pending, start] = useTransition();
  const [selection, setSelection] = useState<string>(locale);
  const [error, setError] = useState('');
  const router = useRouter();
  const es = locale === 'es';
  return (
    <div className="locale-switcher">
      <label className="sr-only" htmlFor="locale">{es ? 'Idioma' : 'Language'}</label>
      <select
        id="locale"
        name="locale"
        value={pending ? selection : locale}
        disabled={pending}
        aria-describedby={pending || error ? 'locale-status' : undefined}
        onChange={(event) => {
          const { value } = event.currentTarget;
          const form = new FormData();
          form.set('locale', value);
          setSelection(value);
          setError('');
          start(async () => {
            try {
              const result = await setPreferredLocale(form);
              if (!result.ok) {
                setError(result.message);
                return;
              }
              router.refresh();
            } catch (failure) {
              logFailure('locale_submit', failure);
              setError(es
                ? 'No se pudo guardar el idioma. Vuelve a intentarlo.'
                : 'Could not save the language. Please try again.');
            }
          });
        }}
      >
        <option value="en">EN</option>
        <option value="es">ES</option>
      </select>
      {pending && <span id="locale-status" role="status">{es ? 'Guardando…' : 'Saving…'}</span>}
      {error && <span id="locale-status" role="alert">{error}</span>}
    </div>
  );
}
