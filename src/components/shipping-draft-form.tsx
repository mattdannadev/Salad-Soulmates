'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import saveShippingDraft from '@/app/shipping-actions';
import type { CustomerOrder } from '@/domain/customer-orders';
import { shippingDraftInputSchema } from '@/domain/shipping';
import type { ShippingDraftInput } from '@/domain/shipping';
import { formatNumber } from '@/domain/format';

export default function ShippingDraftForm({ order, locale }: {
  order: CustomerOrder; locale: 'en' | 'es';
}) {
  const prefix = useId();
  const router = useRouter();
  const es = locale === 'es';
  const [plannedOn, setPlannedOn] = useState(order.needed_on);
  const [method, setMethod] = useState('Shipment');
  const [note, setNote] = useState('');
  const [quantities, setQuantities] = useState<Record<string, string>>({});
  const [attempt, setAttempt] = useState<ShippingDraftInput | null>(null);
  const [saved, setSaved] = useState(false);
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const saveLabel = es ? 'Guardar borrador' : 'Save draft';
  const retryLabel = es ? 'Reintentar guardado' : 'Retry save';
  function submit() {
    const parsed = shippingDraftInputSchema.safeParse(attempt ?? {
      id: crypto.randomUUID(),
      order_id: order.id,
      planned_on: plannedOn,
      method,
      note,
      lines: order.items.filter((item) => Number(quantities[item.product_id] ?? 0) !== 0)
        .map((item) => ({
          product_id: item.product_id, quantity: Number(quantities[item.product_id]),
        })),
    });
    if (!parsed.success) {
      setMessage(es ? 'Selecciona al menos un producto con cantidad entera positiva.' : 'Choose at least one product with a positive whole-unit quantity.');
      return;
    }
    setAttempt(parsed.data);
    startTransition(async () => {
      try {
        const result = await saveShippingDraft(parsed.data);
        setMessage(result.ok && es ? 'Borrador guardado. No se ha enviado nada.' : result.message);
        if (result.ok) {
          setSaved(true);
          router.refresh();
        }
      } catch {
        setMessage(es ? 'Conexión interrumpida. Reintenta guardar los mismos datos.' : 'Connection interrupted. Retry saving the same entries.');
      }
    });
  }
  return (
    <form
      className="record-form"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <p>{es ? 'Este borrador no reserva inventario ni completa el pedido. Los borradores son alternativas independientes.' : 'This draft does not reserve stock or fulfill the order. Drafts are independent preparation snapshots.'}</p>
      <fieldset disabled={pending || attempt !== null}>
        <legend>{es ? 'Preparar envío o recogida' : 'Prepare shipment or pickup'}</legend>
        <div className="form-grid">
          <label htmlFor={`${prefix}-date`}>
            {es ? 'Fecha prevista' : 'Planned date'}
            <input id={`${prefix}-date`} type="date" required value={plannedOn} onChange={(event) => setPlannedOn(event.currentTarget.value)} />
          </label>
          <label htmlFor={`${prefix}-method`}>
            {es ? 'Método' : 'Method'}
            <select id={`${prefix}-method`} value={method} onChange={(event) => setMethod(event.currentTarget.value)}>
              <option value="Shipment">{es ? 'Envío' : 'Shipment'}</option>
              <option value="Pickup">{es ? 'Recogida' : 'Pickup'}</option>
            </select>
          </label>
        </div>
        {order.items.map((item) => (
          <label key={item.product_id} htmlFor={`${prefix}-${item.product_id}`}>
            {`${item.product_name} · ${item.packaging_label} · ${formatNumber(item.unit_count)} ${item.unit_name}`}
            <input id={`${prefix}-${item.product_id}`} type="number" min="0" max={item.unit_count} step="1" value={quantities[item.product_id] ?? ''} placeholder="0" onChange={(event) => setQuantities({ ...quantities, [item.product_id]: event.currentTarget.value })} />
            <small>{es ? 'Cantidad propuesta; 0 u omitir para excluir.' : 'Proposed quantity; enter 0 or leave blank to exclude.'}</small>
          </label>
        ))}
        <label htmlFor={`${prefix}-note`}>
          {es ? 'Notas de preparación' : 'Preparation notes'}
          <textarea id={`${prefix}-note`} maxLength={1000} value={note} onChange={(event) => setNote(event.currentTarget.value)} />
        </label>
      </fieldset>
      {attempt && !saved && <p>{es ? 'Los datos se mantienen para un reintento seguro. Si el guardado falló, reintenta con los mismos datos.' : 'Entries are held for a safe retry. If the save failed, retry with the same entries.'}</p>}
      <div className="actions">
        {!saved && <button type="submit" disabled={pending}>{attempt ? retryLabel : saveLabel}</button>}
        {attempt && (
        <button
          type="button"
          className="secondary"
          disabled={pending}
          onClick={() => {
            setAttempt(null);
            setSaved(false);
            setMessage('');
          }}
        >
          {es ? 'Preparar otro borrador' : 'Prepare another draft'}
        </button>
        )}
      </div>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
