'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { z } from 'zod';
import saveReceiving from '@/app/receiving-actions';
import { parsePackageLines } from '@/domain/receiving';
import type { ActionResult } from '@/domain/master-data';
import type { ReactNode } from 'react';

/** Keep entered values and the request token after errors, including ambiguous timeouts. */
export default function ReceivingSubmit({
  children, operation, values = {}, submit, locale = 'en',
}: {
  children: ReactNode;
  operation: 'receive' | 'serialize' | 'change';
  values?: Record<string, unknown>;
  submit: string;
  locale?: 'en' | 'es';
}) {
  const [result, setResult] = useState<ActionResult>();
  const [pending, start] = useTransition();
  const requestId = useRef<string | undefined>(undefined);
  const router = useRouter();
  const savingLabel = locale === 'es' ? 'Guardando…' : 'Saving…';
  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending) return;
        const form = event.currentTarget;
        const fields = new FormData(form);
        const input: Record<string, unknown> = { ...values, ...Object.fromEntries(fields) };
        try {
          if (operation !== 'change') input.packages = parsePackageLines(fields.get('package_lines'));
          if (operation === 'receive') input.quantity = Number(fields.get('quantity'));
          if (operation === 'change') input.remaining_quantity = Number(fields.get('remaining_quantity'));
        } catch (error) {
          const message = error instanceof z.ZodError ? error.issues[0]?.message : undefined;
          setResult({ ok: false, message: message ?? 'Check package quantities: one quantity | barcode per line.' });
          return;
        }
        requestId.current ??= crypto.randomUUID();
        if (operation === 'receive') input.request_id = requestId.current;
        if (operation === 'change') input.id = requestId.current;
        start(async () => {
          try {
            const response = await saveReceiving(operation, input);
            setResult(response);
            if (response.ok) {
              requestId.current = undefined;
              if (operation === 'receive') form.reset();
              router.refresh();
            }
          } catch {
            setResult({
              ok: false,
              message: locale === 'es'
                ? 'Conexión interrumpida. Intenta de nuevo con los mismos datos.'
                : 'Connection interrupted. Retry with the same entries.',
            });
          }
        });
      }}
    >
      {children}
      {result && (
      <p
        role={result.ok ? 'status' : 'alert'}
        className={result.ok ? 'notice' : 'error-notice'}
      >
        {result.message}
      </p>
      )}
      {result?.ok && operation === 'receive' && result.id && (
        <Link href={`/receiving/labels?receipt=${result.id}`}>
          {locale === 'es' ? 'Ver e imprimir etiquetas' : 'View and print package labels'}
        </Link>
      )}
      <button type="submit" disabled={pending}>
        {pending ? savingLabel : submit}
      </button>
    </form>
  );
}
