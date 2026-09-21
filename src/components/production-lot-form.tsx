'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { assignProductionLot } from '@/app/production-actions';

export default function ProductionLotForm({
  orderId, productId, productName, locale,
}: {
  orderId: string;
  productId: string;
  productName: string;
  locale: 'en' | 'es';
}) {
  const id = useId();
  const router = useRouter();
  const es = locale === 'es';
  const [assignedOn, setAssignedOn] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="production-lot-form"
      onSubmit={(event) => {
        event.preventDefault();
        startTransition(async () => {
          const result = await assignProductionLot({
            order_id: orderId,
            product_id: productId,
            assigned_on: assignedOn,
          });
          setMessage(result.message);
          if (result.ok) router.refresh();
        });
      }}
    >
      <label htmlFor={id}>
        {es ? `Asignar lote para ${productName}` : `Assign lot for ${productName}`}
        <input id={id} type="date" required value={assignedOn} onChange={(event) => setAssignedOn(event.currentTarget.value)} />
      </label>
      <button type="submit" disabled={pending}>{es ? 'Asignar lote DDDYY' : 'Assign DDDYY lot'}</button>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
