'use client';

import { useEffect, useState } from 'react';

interface ErrorPageProps {
  error: Error & { digest?: string };
  reset: () => void;
  scope: 'application' | 'public';
}

function isErrorReference(value: unknown): value is { errorId: string } {
  return typeof value === 'object'
    && value !== null
    && 'errorId' in value
    && typeof value.errorId === 'string';
}

export default function ApplicationErrorPage({ error, reset, scope }: ErrorPageProps) {
  const [reference, setReference] = useState<string>();
  const isApplication = scope === 'application';

  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/error-reports', {
      body: JSON.stringify({ digest: error.digest, route: window.location.pathname, scope }),
      headers: { 'content-type': 'application/json' },
      method: 'POST',
      signal: controller.signal,
    })
      .then(async (response) => {
        if (!response.ok) return null;
        const payload: unknown = await response.json();
        return isErrorReference(payload) ? payload : null;
      })
      .then((result) => setReference(result?.errorId))
      .catch(() => undefined);
    return () => controller.abort();
  }, [error.digest, scope]);

  return (
    <section className="panel" aria-live="polite">
      <h1>{isApplication ? 'We couldn’t load this workspace page.' : 'We couldn’t load this page.'}</h1>
      <p>
        {isApplication
          ? 'Your saved records have not been changed. Refresh the page or try again; if this keeps happening, share the error reference with your administrator.'
          : 'The request could not be completed. Try again, and contact support if the problem continues.'}
      </p>
      {reference && (
        <p>
          <strong>Error reference:</strong>
          {' '}
          <code>{reference}</code>
        </p>
      )}
      <button type="button" onClick={reset}>Try again</button>
    </section>
  );
}
