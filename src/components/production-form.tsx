'use client';

import { useId, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import saveProduction from '@/app/production-actions';
import type { ProductionPlan } from '@/domain/production';

export default function ProductionForm({
  orderId, dueDate, plan, locale,
}: {
  orderId: string;
  dueDate: string;
  plan: ProductionPlan | undefined;
  locale: 'en' | 'es';
}) {
  const prefix = useId();
  const router = useRouter();
  const es = locale === 'es';
  const [start, setStart] = useState(plan?.start_on ?? '');
  const [finish, setFinish] = useState(plan?.finish_on ?? dueDate);
  const [note, setNote] = useState(plan?.note ?? '');
  const [shortageReason, setShortageReason] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const datesChanged = start !== plan?.start_on || finish !== plan?.finish_on;
  function submit(status: ProductionPlan['status']) {
    startTransition(async () => {
      try {
        const result = await saveProduction({
          id: orderId,
          revision: plan?.revision ?? 0,
          start_on: start,
          finish_on: finish,
          status,
          note,
          shortage_reason: status === 'Confirmed' ? shortageReason : '',
        });
        setMessage(result.ok && es ? 'Preparación guardada.' : result.message);
        if (result.ok) router.refresh();
      } catch {
        setMessage(es ? 'No se pudo conectar. Intenta de nuevo con los mismos datos.' : 'Unable to connect. Retry with the same entries.');
      }
    });
  }
  return (
    <form onSubmit={(event) => {
      event.preventDefault();
      submit('Draft');
    }}
    >
      <fieldset disabled={pending} className="production-controls">
        <legend>{es ? 'Fechas de producción' : 'Production dates'}</legend>
        <div className="form-grid">
          <label htmlFor={`${prefix}-start`}>
            {es ? 'Inicio / ingredientes listos' : 'Start / ingredients ready by'}
            <input id={`${prefix}-start`} type="date" required max={finish || dueDate} value={start} onChange={(event) => setStart(event.currentTarget.value)} />
          </label>
          <label htmlFor={`${prefix}-finish`}>
            {es ? 'Finalización prevista' : 'Planned completion'}
            <input id={`${prefix}-finish`} type="date" required min={start} max={dueDate} value={finish} onChange={(event) => setFinish(event.currentTarget.value)} />
          </label>
        </div>
        <label htmlFor={`${prefix}-note`}>
          {es ? 'Notas / motivo del cambio' : 'Notes / reason for change'}
          <textarea id={`${prefix}-note`} maxLength={1000} value={note} onChange={(event) => setNote(event.currentTarget.value)} />
        </label>
        {plan?.status === 'Draft' && (
        <label htmlFor={`${prefix}-shortage`}>
          {es ? 'Cómo se resolverán los faltantes (si hay)' : 'How shortages will be resolved (if any)'}
          <textarea id={`${prefix}-shortage`} maxLength={1000} value={shortageReason} onChange={(event) => setShortageReason(event.currentTarget.value)} />
        </label>
        )}
        <div className="actions">
          <button type="submit">{es ? 'Guardar borrador de producción' : 'Save production draft'}</button>
          {plan?.status === 'Draft' && <button type="button" disabled={datesChanged} onClick={() => submit('Confirmed')}>{es ? 'Confirmar preparación' : 'Confirm production preparation'}</button>}
          {plan && plan.status !== 'Cancelled' && <button className="secondary" type="button" disabled={datesChanged} onClick={() => submit('Cancelled')}>{es ? 'Cancelar preparación' : 'Cancel production preparation'}</button>}
        </div>
        {plan && datesChanged && <p>{es ? 'Guarda las fechas antes de confirmar.' : 'Save the dates before confirming.'}</p>}
      </fieldset>
      {message && <p role="status">{message}</p>}
    </form>
  );
}
