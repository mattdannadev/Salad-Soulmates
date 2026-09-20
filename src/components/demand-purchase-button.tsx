'use client';

import { useRef, useState, useTransition } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import generateDemandPurchases from '@/app/demand-purchase-actions';
import type { PurchaseGeneration } from '@/domain/demand-coverage';

export default function DemandPurchaseButton({ es }: { es: boolean }) {
  const request = useRef<string | null>(null);
  const [pending, startTransition] = useTransition();
  const [result, setResult] = useState<PurchaseGeneration | null>(null);
  const [error, setError] = useState('');
  const router = useRouter();
  const pendingLabel = es ? 'Preparando compras…' : 'Preparing purchases…';
  const buttonLabel = es ? 'Generar borradores por proveedor' : 'Generate supplier purchase drafts';
  function generate() {
    request.current ??= crypto.randomUUID();
    const id = request.current;
    startTransition(async () => {
      setError('');
      try {
        const response = await generateDemandPurchases(id);
        if (!response.ok) setError(response.message);
        else {
          setResult(response.result);
          router.refresh();
        }
      } catch {
        console.error('generate_demand_purchases', { code: 'CONNECTION_INTERRUPTED' });
        setError(es ? 'Conexión interrumpida. Reintenta con este botón.'
          : 'Connection interrupted. Retry safely with this button.');
      }
    });
  }
  return (
    <div className="demand-purchase-action">
      <button type="button" onClick={generate} disabled={pending || result !== null}>
        {pending ? pendingLabel : buttonLabel}
      </button>
      {error && <p role="alert">{error}</p>}
      {result && (
        <div role="status">
          <p>{`${result.created.length} ${es ? 'borradores creados.' : 'purchase drafts created.'}`}</p>
          {result.skipped.length > 0 && (
            <ul>
              {result.skipped.map((item) => (
                <li key={`${item.ingredient}:${item.reason}`}>{`${item.ingredient}: ${item.reason}`}</li>
              ))}
            </ul>
          )}
          <Link href="/app/purchasing">{es ? 'Revisar compras →' : 'Review purchases →'}</Link>
        </div>
      )}
    </div>
  );
}
