'use client';

import {
  useId, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/domain/master-data';
import savePurchasing from '@/app/purchasing-actions';

/** Preserve values and the request token until success, including lost-response retries. */
export default function PurchasingForm({
  children,
  operation,
  payload,
  label,
  locale,
  destination = undefined,
}: {
  children: React.ReactNode;
  operation: 'save-option' | 'save-order' | 'cancel-order' | 'create-draft' | 'change-status' | 'cancel-plan';
  payload: (form: FormData, requestId: string) => unknown;
  label: string;
  locale: 'en' | 'es';
  destination?: (id: string) => string;
}) {
  const [pending, start] = useTransition();
  const [result, setResult] = useState<ActionResult>();
  const token = useRef<string | undefined>(undefined);
  const messageId = useId();
  const router = useRouter();
  const savingLabel = locale === 'es' ? 'Guardando…' : 'Saving…';
  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        const form = new FormData(event.currentTarget);
        token.current ??= crypto.randomUUID();
        const values = payload(form, token.current);
        start(async () => {
          try {
            const response = await savePurchasing(operation, values);
            setResult(response);
            if (response.ok && response.id) {
              if (destination) router.push(destination(response.id));
              router.refresh();
            }
          } catch {
            setResult({
              ok: false,
              message:
                locale === 'es'
                  ? 'Conexión interrumpida. Vuelve a intentar con los mismos valores.'
                  : 'Connection interrupted. Retry with the same entries.',
            });
          }
        });
      }}
    >
      <fieldset disabled={pending || result?.ok} className="purchasing-fields">
        {children}
        <button type="submit" aria-describedby={result ? messageId : undefined}>
          {pending ? savingLabel : label}
        </button>
      </fieldset>
      {result && (
        <p
          id={messageId}
          role={result.ok ? 'status' : 'alert'}
          className={result.ok ? 'notice' : 'error-notice'}
        >
          {result.message}
        </p>
      )}
    </form>
  );
}
