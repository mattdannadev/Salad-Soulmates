'use client';

import {
  Fragment, useId, useMemo, useState, useTransition,
} from 'react';
import { useRouter } from 'next/navigation';
import orderPlanAction from '@/app/order-plan-actions';
import type { ProductionAdjustments, ProductionWorkProposal } from '@/domain/order-plan-actions';
import { formatDate, formatNumber } from '@/domain/format';
import useNativeDialog from './use-native-dialog';
import styles from './order-production-proposal.module.css';

/** Preview is read-only. Only the explicit confirmation creates production work. */
export default function OrderProductionProposal({ orderId, orderLabel, locale }: {
  orderId: string;
  orderLabel: string;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const creatingLabel = es ? 'Creando…' : 'Creating…';
  const confirmLabel = es ? 'Confirmar y crear trabajo' : 'Confirm and create work orders';
  const id = useId();
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [proposal, setProposal] = useState<ProductionWorkProposal | null>(null);
  const [message, setMessage] = useState('');
  const [success, setSuccess] = useState('');
  const [productionStart, setProductionStart] = useState('');
  const [productDays, setProductDays] = useState<{
    product_id: string; product_name: string; workdays: string;
  }[]>([]);
  const [adjustments, setAdjustments] = useState<ProductionAdjustments>({});
  const [changed, setChanged] = useState(false);
  const [creating, setCreating] = useState(false);
  const proposedDays = useMemo(() => {
    if (!proposal) return [];
    const stageOrder = { ingredient_prep: 0, mixing: 1, packaging: 2 } as const;
    const byDay = new Map<string, ProductionWorkProposal['events']>();
    proposal.events
      .toSorted((left, right) => left.work_on.localeCompare(right.work_on)
        || stageOrder[left.kind] - stageOrder[right.kind]
        || left.product_name.localeCompare(right.product_name, locale))
      .forEach((work) => {
        const day = byDay.get(work.work_on) ?? [];
        day.push(work);
        byDay.set(work.work_on, day);
      });
    return [...byDay.entries()];
  }, [proposal, locale]);
  const {
    dialog, openDialog, closeDialog, closeAfterAction, onCancel, onClose,
  } = useNativeDialog(pending);

  function preview(opener?: HTMLElement, nextAdjustments: ProductionAdjustments = {}) {
    if (opener) {
      openDialog(opener);
      setProposal(null);
      setChanged(false);
    }
    setMessage('');
    setSuccess('');
    setCreating(false);
    startTransition(async () => {
      try {
        const result = await orderPlanAction('preview-production', { order_id: orderId, ...nextAdjustments });
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        if (result.kind === 'proposal') {
          setProposal(result.data);
          setAdjustments(nextAdjustments);
          setProductionStart(result.data.start_on);
          const productIds = [...new Set(result.data.events.map((work) => work.product_id))];
          const products = result.data.product_days ?? productIds.map((productId) => ({
            product_id: productId,
            product_name: result.data.events.find((work) => work.product_id === productId)?.product_name ?? '',
            workdays: Math.max(1, new Set(result.data.events
              .filter((work) => work.product_id === productId && work.kind === 'mixing')
              .map((work) => work.work_on)).size),
          }));
          setProductDays(products.map((product) => ({
            ...product, workdays: String(product.workdays),
          })));
          setChanged(false);
        }
      } catch {
        setMessage(es ? 'No se pudo cargar la propuesta. Intenta de nuevo.' : 'Could not load the proposal. Try again.');
      }
    });
  }

  function recalculate() {
    if (!productionStart || productDays.some((product) => !/^\d+$/.test(product.workdays)
      || Number(product.workdays) < 1 || Number(product.workdays) > 90)) {
      setMessage(es ? 'Selecciona una fecha y de 1 a 90 días laborables por producto.' : 'Choose a start date and 1–90 mixing workdays for each product.');
      return;
    }
    preview(undefined, {
      production_start_on: productionStart,
      product_days: productDays.map((product) => ({
        product_id: product.product_id, workdays: Number(product.workdays),
      })),
    });
  }

  function confirm() {
    if (!proposal?.can_confirm || changed) return;
    setMessage('');
    setCreating(true);
    startTransition(async () => {
      try {
        const result = await orderPlanAction('create-production', {
          order_id: orderId,
          fingerprint: proposal.fingerprint,
          ...adjustments,
        });
        if (!result.ok) {
          setMessage(result.message);
          return;
        }
        closeAfterAction();
        setSuccess(es ? 'Plan de producción y órdenes de trabajo creados.' : 'Production plan and work orders created.');
        router.refresh();
      } catch {
        setMessage(es ? 'Conexión interrumpida. Revisa la propuesta antes de reintentar.' : 'Connection interrupted. Review the proposal before retrying.');
      }
    });
  }

  return (
    <div>
      <button type="button" className="button" disabled={pending} onClick={(event) => preview(event.currentTarget)}>
        {es ? 'Proponer plan de producción' : 'Propose Production Plan'}
      </button>
      {success ? <p role="status">{success}</p> : null}
      <dialog ref={dialog} className={`order-confirmation ${styles.dialog}`} aria-labelledby={`${id}-title`} onCancel={onCancel} onClose={onClose}>
        <form onSubmit={(event) => {
          event.preventDefault();
          confirm();
        }}
        >
          <h2 id={`${id}-title`}>{es ? 'Plan de producción propuesto' : 'Proposed production plan'}</h2>
          <p>{orderLabel}</p>
          {pending && !proposal ? <p role="status">{es ? 'Calculando el plan…' : 'Calculating the plan…'}</p> : null}
          {proposal ? (
            <>
              <fieldset className={styles.adjustments} disabled={pending || proposal.existing_plan}>
                <legend>{es ? 'Ajustar la propuesta' : 'Adjust proposal'}</legend>
                <label htmlFor={`${id}-start`}>
                  {es ? 'Inicio de producción planificado' : 'Planned production start'}
                  <input
                    id={`${id}-start`}
                    type="date"
                    value={productionStart}
                    onChange={(event) => {
                      setProductionStart(event.target.value);
                      setChanged(true);
                    }}
                  />
                </label>
                {productDays.map((product) => (
                  <label key={product.product_id} htmlFor={`${id}-${product.product_id}-days`}>
                    {product.product_name}
                    {' — '}
                    {es ? 'días laborables de mezcla' : 'mixing workdays'}
                    <input
                      id={`${id}-${product.product_id}-days`}
                      type="number"
                      min={1}
                      max={90}
                      step={1}
                      value={product.workdays}
                      onChange={(event) => {
                        const { value } = event.target;
                        setProductDays((current) => current.map((item) => (
                          item.product_id === product.product_id
                            ? { ...item, workdays: value } : item
                        )));
                        setChanged(true);
                      }}
                    />
                  </label>
                ))}
                <p>{es ? 'Los días de mezcla son días laborables por producto. Recalcula para revisar las fechas, la capacidad y los trabajadores necesarios.' : 'Mixing days are workdays for each product. Recalculate to review dates, capacity and required workers.'}</p>
                <button type="button" disabled={!changed} onClick={recalculate}>{es ? 'Recalcular propuesta' : 'Recalculate proposal'}</button>
              </fieldset>
              {changed ? <p role="status">{es ? 'Hay cambios pendientes. Recalcula la propuesta antes de confirmar.' : 'Changes pending. Recalculate the proposal before confirming.'}</p> : null}
              {pending && !creating ? <p role="status">{es ? 'Recalculando el plan…' : 'Recalculating the plan…'}</p> : null}
              <p>
                {es ? 'Finalización de producción' : 'Production completion'}
                :
                {' '}
                {formatDate(proposal.finish_on)}
                {' '}
                ·
                {' '}
                {es ? 'Recogida' : 'Pickup'}
                :
                {' '}
                {formatDate(proposal.pickup_on)}
              </p>
              <p>{es ? 'Las fechas usan el calendario de la planta. Al confirmar se crearán los lotes, preparaciones y eventos que aparecen abajo.' : 'Dates use the facility calendar. Confirmation creates the batches, preparations and planner events shown below.'}</p>
              <div className="table-wrap">
                <table>
                  <caption className="sr-only">{es ? 'Órdenes de trabajo propuestas' : 'Proposed work orders'}</caption>
                  <thead>
                    <tr>
                      <th scope="col">{es ? 'Trabajo' : 'Work'}</th>
                      <th scope="col">{es ? 'Producto' : 'Product'}</th>
                      <th scope="col">{es ? 'Lotes' : 'Batches'}</th>
                      <th scope="col">{es ? 'Trabajadores necesarios' : 'Required workers'}</th>
                      <th scope="col">{es ? 'Inicio' : 'Start'}</th>
                      <th scope="col">{es ? 'Fin' : 'Finish'}</th>
                    </tr>
                  </thead>
                  <tbody>
                    {proposedDays.map(([day, work]) => (
                      <Fragment key={day}>
                        <tr className={styles.dayHeading}>
                          <th scope="rowgroup" colSpan={6}>{formatDate(day)}</th>
                        </tr>
                        {work.map((item) => (
                          <tr key={`${item.product_id}-${item.kind}-${item.start_at}`}>
                            <th scope="row">{item.title}</th>
                            <td>{item.product_name}</td>
                            <td>{formatNumber(item.batch_count)}</td>
                            <td>{formatNumber(item.required_worker_count)}</td>
                            <td>{item.all_day ? formatDate(item.work_on) : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: proposal.timezone }).format(new Date(item.start_at))}</td>
                            <td>{item.all_day ? formatDate(item.work_on) : new Intl.DateTimeFormat(locale, { dateStyle: 'medium', timeStyle: 'short', timeZone: proposal.timezone }).format(new Date(item.end_at))}</td>
                          </tr>
                        ))}
                      </Fragment>
                    ))}
                  </tbody>
                </table>
              </div>
              {proposal.warnings.length ? <ul className="notice">{proposal.warnings.map((warning) => <li key={warning}>{warning}</li>)}</ul> : null}
            </>
          ) : null}
          {message ? <p className="error-notice" role="alert">{message}</p> : null}
          <div className="order-dialog-actions">
            <button type="button" className="secondary" disabled={pending} onClick={closeDialog}>{es ? 'Cerrar' : 'Close'}</button>
            {!proposal && !pending ? <button type="button" onClick={(event) => preview(event.currentTarget)}>{es ? 'Reintentar' : 'Retry proposal'}</button> : null}
            <button type="submit" disabled={pending || changed || !proposal?.can_confirm}>{pending && creating ? creatingLabel : confirmLabel}</button>
          </div>
        </form>
      </dialog>
    </div>
  );
}
