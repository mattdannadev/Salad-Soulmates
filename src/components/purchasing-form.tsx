'use client';

import {
  useId, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import type { ActionResult } from '@/domain/master-data';
import savePurchasing from '@/app/purchasing-actions';
import FormFooter from './form-footer';

/** Preserve values and the request token until success, including lost-response retries. */
export default function PurchasingForm({
  children,
  operation,
  payload,
  label,
  locale,
  destination = undefined,
  cancelHref = undefined,
  replaceOnSuccess = false,
}: {
  children: React.ReactNode;
  operation: 'save-customer' | 'save-option' | 'save-order' | 'change-pickup-date' | 'cancel-order' | 'create-draft' | 'change-status' | 'cancel-plan';
  payload: (form: FormData, requestId: string) => unknown;
  label: string;
  locale: 'en' | 'es';
  destination?: (id: string) => string;
  cancelHref?: string;
  replaceOnSuccess?: boolean;
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
              if (destination) {
                if (replaceOnSuccess) router.replace(destination(response.id));
                else router.push(destination(response.id));
              }
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
        {cancelHref ? (
          <FormFooter
            submitLabel={label}
            cancelLabel={locale === 'es' ? 'Cancelar' : 'Cancel'}
            cancelHref={cancelHref}
            pending={pending}
            pendingLabel={savingLabel}
            disabled={result?.ok}
            feedback={result ? { kind: result.ok ? 'success' : 'error', message: result.message } : undefined}
          />
        ) : (
          <button type="submit" aria-describedby={result ? messageId : undefined}>
            {pending ? savingLabel : label}
          </button>
        )}
      </fieldset>
      {result && !cancelHref && (
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
