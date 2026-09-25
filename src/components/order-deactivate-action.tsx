'use client';

import {
  useEffect, useRef, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import savePurchasing from '@/app/purchasing-actions';

interface OrderDeactivateActionProps {
  orderId: string;
  orderLabel: string;
  returnToDirectory?: boolean;
}

/** Soft-deactivates an order through the existing cancellation RPC. History remains intact. */
export default function OrderDeactivateAction({
  orderId,
  orderLabel,
  returnToDirectory = false,
}: OrderDeactivateActionProps) {
  const confirmation = useRef<HTMLDialogElement>(null);
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState('');
  const [failed, setFailed] = useState(false);
  const router = useRouter();

  useEffect(() => {
    if (!message || failed) return undefined;
    const timer = window.setTimeout(() => setMessage(''), 6000);
    return () => window.clearTimeout(timer);
  }, [failed, message]);

  function deactivateOrder() {
    startTransition(async () => {
      setMessage('');
      setFailed(false);
      try {
        const result = await savePurchasing('cancel-order', { id: orderId });
        if (!result.ok) {
          setFailed(true);
          setMessage(result.message);
          return;
        }
        confirmation.current?.close();
        const successMessage = 'Order deactivated and removed from active orders.';
        if (returnToDirectory) {
          window.sessionStorage.setItem('orders-toast', successMessage);
          router.back();
          return;
        }
        setMessage(successMessage);
        router.refresh();
      } catch {
        setFailed(true);
        setMessage('Connection interrupted. Retry with the same entries.');
      }
    });
  }

  return (
    <div className="order-deactivate-action">
      <button
        type="button"
        className="button danger-button"
        onClick={() => confirmation.current?.showModal()}
      >
        Deactivate
      </button>
      {message && !returnToDirectory ? (
        <p className={failed ? 'error-notice' : 'order-toast'} role={failed ? 'alert' : 'status'}>{message}</p>
      ) : null}
      <dialog ref={confirmation} className="order-confirmation" aria-labelledby={`deactivate-${orderId}`}>
        <form
          onSubmit={(event) => {
            event.preventDefault();
            deactivateOrder();
          }}
        >
          <h2 id={`deactivate-${orderId}`}>Deactivate this order?</h2>
          <p>
            {`${orderLabel} will be removed from active orders. Its saved quantities and history remain available.`}
          </p>
          {message && failed ? <p className="error-notice" role="alert">{message}</p> : null}
          <div className="order-dialog-actions">
            <button type="button" className="secondary" disabled={pending} onClick={() => confirmation.current?.close()}>
              Keep order
            </button>
            <button type="submit" className="danger-button" disabled={pending}>
              {pending ? 'Deactivating…' : 'Deactivate order'}
            </button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
