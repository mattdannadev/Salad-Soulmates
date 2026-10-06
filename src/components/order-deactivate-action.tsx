'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import orderPlanAction from '@/app/order-plan-actions';
import { orderRecordLabel } from '@/domain/order-plan-actions';
import type { OrderDeletePreview } from '@/domain/order-plan-actions';
import useNativeDialog from './use-native-dialog';

/** Testing deletion permanently purges the order's exclusive transactional records. */
export default function OrderDeactivateAction({
  orderId, orderLabel, returnToDirectory = false, locale = 'en',
}: {
  orderId: string;
  orderLabel: string;
  returnToDirectory?: boolean;
  locale?: 'en' | 'es';
}) {
  const es = locale === 'es';
  const deletingLabel = es ? 'Eliminando…' : 'Deleting…';
  const deleteLabel = es ? 'Eliminar permanentemente' : 'Permanently delete order';
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [preview, setPreview] = useState<OrderDeletePreview | null>(null);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const {
    dialog, openDialog, closeDialog, closeAfterAction, onCancel, onClose,
  } = useNativeDialog(pending);

  function loadPreview(opener: HTMLElement) {
    openDialog(opener);
    setPreview(null);
    setMessage('');
    setSuccess('');
    startTransition(async () => {
      try {
        const result = await orderPlanAction('preview-delete', { order_id: orderId });
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        if (result.kind === 'delete-preview') setPreview(result.data);
      } catch {
        setMessage(es ? 'No se pudo revisar el pedido. Intenta de nuevo.' : 'Could not review this order. Try again.');
      }
    });
  }

  function deleteOrder() {
    if (!preview?.can_delete) return;
    setMessage('');
    startTransition(async () => {
      try {
        const result = await orderPlanAction('delete-order', {
          order_id: orderId, fingerprint: preview.fingerprint, confirmation: preview.reference,
        });
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        closeAfterAction();
        const notice = es ? 'Pedido y registros asociados eliminados.' : 'Order and associated records deleted.';
        if (returnToDirectory) {
          window.sessionStorage.setItem('orders-toast', notice);
          router.replace('/app/orders');
        } else setSuccess(notice);
        router.refresh();
      } catch {
        setMessage(es ? 'No se pudo confirmar la eliminación. Actualiza y revisa el pedido.' : 'Deletion could not be confirmed. Reload and review the order.');
      }
    });
  }

  return (
    <div className="order-deactivate-action">
      <button type="button" className="button danger-button" disabled={pending} onClick={(event) => loadPreview(event.currentTarget)}>{es ? 'Eliminar pedido' : 'Delete order'}</button>
      {success ? <p className="order-toast" role="status">{success}</p> : null}
      <dialog ref={dialog} className="order-confirmation" aria-labelledby={`${id}-title`} aria-describedby={`${id}-description`} onCancel={onCancel} onClose={onClose}>
        <form onSubmit={(event) => {
          event.preventDefault();
          deleteOrder();
        }}
        >
          <h2 id={`${id}-title`}>{es ? '¿Eliminar este pedido permanentemente?' : 'Permanently delete this order?'}</h2>
          <p id={`${id}-description`}>{es ? `${orderLabel} y sus registros asociados se eliminarán permanentemente. Esta acción no se puede deshacer.` : `${orderLabel} and its associated records will be permanently deleted. This cannot be undone.`}</p>
          {pending && !preview ? <p role="status">{es ? 'Revisando registros asociados…' : 'Reviewing associated records…'}</p> : null}
          {preview ? (
            <>
              <ul>
                {preview.counts.filter((entry) => entry.count > 0).map((entry) => (
                  <li key={entry.table_name}>
                    {entry.count}
                    {' '}
                    {orderRecordLabel(entry.table_name, es)}
                  </li>
                ))}
              </ul>
              <p className="muted">{es ? 'Los clientes, productos, recetas y el historial de auditoría se conservan. Solo se eliminan los registros exclusivos de este pedido.' : 'Customers, products, recipes and audit history are retained. Only records belonging exclusively to this order are removed.'}</p>
              {preview.warnings.length ? <ul className="notice">{preview.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            </>
          ) : null}
          {message ? <p className="error-notice" role="alert">{message}</p> : null}
          <div className="order-dialog-actions">
            <button type="button" className="secondary" disabled={pending} onClick={closeDialog}>{es ? 'Conservar pedido' : 'Keep order'}</button>
            {!preview && !pending ? <button type="button" onClick={(event) => loadPreview(event.currentTarget)}>{es ? 'Reintentar' : 'Retry review'}</button> : null}
            <button type="submit" className="danger-button" disabled={pending || !preview?.can_delete}>{pending && preview ? deletingLabel : deleteLabel}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
