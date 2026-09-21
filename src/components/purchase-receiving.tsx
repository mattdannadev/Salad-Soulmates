'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  useEffect, useId, useMemo, useRef, useState, useTransition,
} from 'react';
import type { FormEvent } from 'react';
import { z } from 'zod';
import receivePurchaseDelivery from '@/app/purchase-receiving-actions';
import {
  facilityDate, formatDate, formatNumber, QUANTITY_SCALE,
} from '@/domain/format';
import {
  purchaseDeliverySchema,
  type PurchaseDelivery,
  type PurchaseDeliveryResult,
  type PurchaseReceivingLine,
  type PurchaseReceivingOrder,
} from '@/domain/purchase-receiving';

interface DraftPackage {
  key: string;
  quantity: string;
  supplierBarcode: string;
}

interface DraftSplit {
  id: string;
  quantity: string;
  supplierLot: string;
  expirationDate: string;
  packages: DraftPackage[];
}

const PENDING_DELIVERY_KEY = 'salad-soulmates-pending-purchase-delivery';

function newPackage(quantity = ''): DraftPackage {
  return { key: crypto.randomUUID(), quantity, supplierBarcode: '' };
}

function newSplit(quantity = ''): DraftSplit {
  return {
    id: crypto.randomUUID(),
    quantity,
    supplierLot: '',
    expirationDate: '',
    packages: [newPackage(quantity)],
  };
}

function parseOptionalQuantity(value: string) {
  if (value.trim() === '') return 0;
  return Number(value);
}

function localMessage(result: PurchaseDeliveryResult, locale: 'en' | 'es') {
  if (locale === 'en') return result.message;
  if (result.ok) return 'Entrega recibida, inventario actualizado y etiquetas listas.';
  if (result.retry === 'same_request') {
    return 'No se pudo confirmar el resultado. Reintenta la misma entrega sin editarla.';
  }
  if (result.retry === 'review_existing') {
    return 'Esta solicitud pertenece a trabajo guardado. Revisa el historial antes de borrar la entrega pendiente.';
  }
  if (result.message.includes('permission')) return 'Se requiere permiso de recepción para registrar esta entrega.';
  if (result.message.includes('Package quantities')) return 'Las cantidades de los paquetes deben sumar la cantidad real de cada lote de origen.';
  if (result.message.includes('physical packages')) return 'Una entrega puede contener como máximo 200 paquetes físicos.';
  if (result.message.includes('supplier barcode')) return 'Cada código del proveedor debe identificar un solo paquete físico.';
  if (result.message.includes('outstanding')) return 'La cantidad recibida excede la cantidad pendiente del pedido.';
  return 'Revisa los campos de la entrega y corrige los valores indicados.';
}

function actualQuantity(splits: DraftSplit[]) {
  return splits.reduce((sum, split) => sum + (parseOptionalQuantity(split.quantity) || 0), 0);
}

function orderLabel(order: PurchaseReceivingOrder, es: boolean) {
  return order.reference || `${es ? 'Pedido' : 'PO'} ${order.id.slice(0, 8)}`;
}

function caughtMessage(error: unknown, es: boolean) {
  if (error instanceof z.ZodError) {
    return error.issues[0]?.message
      ?? (es ? 'Revisa los campos de la entrega.' : 'Check the delivery fields.');
  }
  if (error instanceof Error) return error.message;
  return es ? 'Revisa los campos de la entrega.' : 'Check the delivery fields.';
}

function storageProblemMessage(problem: 'unavailable' | 'corrupt', es: boolean) {
  if (problem === 'unavailable') {
    return es
      ? 'El almacenamiento de sesión no está disponible. No se puede recibir de forma segura hasta habilitarlo y recargar.'
      : 'Session storage is unavailable. Receiving is blocked until it is enabled and this page is reloaded.';
  }
  return es
    ? 'Hay una entrega pendiente guardada que no se puede leer. Verifica el historial de recepciones antes de descartarla.'
    : 'A saved pending delivery cannot be read. Verify receipt history before discarding its recovery record.';
}

export default function PurchaseReceiving({
  orders,
  canReceive,
  locale,
  recoveryScope,
}: {
  orders: PurchaseReceivingOrder[];
  canReceive: boolean;
  locale: 'en' | 'es';
  recoveryScope: string;
}) {
  const es = locale === 'es';
  const componentId = useId();
  const router = useRouter();
  const [supplierFilter, setSupplierFilter] = useState('');
  const [selectedOrderIds, setSelectedOrderIds] = useState<string[]>([]);
  const [splitsByLine, setSplitsByLine] = useState<Record<string, DraftSplit[]>>({});
  const [receivedOn, setReceivedOn] = useState(facilityDate());
  const [supplierReference, setSupplierReference] = useState('');
  const [note, setNote] = useState('');
  const [result, setResult] = useState<PurchaseDeliveryResult>();
  const [retryLocked, setRetryLocked] = useState(false);
  const [confirmClear, setConfirmClear] = useState(false);
  const [storageProblem, setStorageProblem] = useState<'unavailable' | 'corrupt'>();
  const [confirmDiscardStored, setConfirmDiscardStored] = useState(false);
  const [confirmReconcile, setConfirmReconcile] = useState(false);
  const [pending, startTransition] = useTransition();
  const submittedPayload = useRef<PurchaseDelivery | undefined>(undefined);
  const requestId = useRef<string | undefined>(undefined);
  const storageKey = `${PENDING_DELIVERY_KEY}:${recoveryScope}`;
  const suppliers = useMemo(() => {
    const entries = new Map<string, string>();
    orders.forEach((order) => entries.set(order.supplierId, order.supplierName));
    return [...entries].sort((left, right) => left[1].localeCompare(right[1]));
  }, [orders]);
  const selectedOrders = orders.filter((order) => selectedOrderIds.includes(order.id));
  const selectedSupplierId = selectedOrders[0]?.supplierId;
  const visibleOrders = orders.filter((order) => (
    !supplierFilter || order.supplierId === supplierFilter
  ));
  const disabled = pending || retryLocked || storageProblem !== undefined;

  useEffect(() => {
    let stored: string | null;
    try {
      stored = window.sessionStorage.getItem(storageKey);
    } catch {
      const timer = window.setTimeout(() => setStorageProblem('unavailable'), 0);
      return () => window.clearTimeout(timer);
    }
    if (!stored) return undefined;
    let parsed: unknown;
    try {
      parsed = JSON.parse(stored);
    } catch {
      const timer = window.setTimeout(() => setStorageProblem('corrupt'), 0);
      return () => window.clearTimeout(timer);
    }
    const delivery = purchaseDeliverySchema.safeParse(parsed);
    if (!delivery.success) {
      const timer = window.setTimeout(() => setStorageProblem('corrupt'), 0);
      return () => window.clearTimeout(timer);
    }
    const timer = window.setTimeout(() => {
      submittedPayload.current = delivery.data;
      requestId.current = delivery.data.request_id;
      setReceivedOn(delivery.data.received_on);
      setSupplierReference(delivery.data.supplier_reference);
      setNote(delivery.data.note);
      const purchaseLineIds = new Set(
        delivery.data.lines.map((line) => line.purchase_draft_line_id),
      );
      setSelectedOrderIds(orders.filter((order) => order.lines.some((line) => (
        purchaseLineIds.has(line.id)
      ))).map((order) => order.id));
      setSplitsByLine(Object.fromEntries([...purchaseLineIds].map((lineId) => [
        lineId,
        delivery.data.lines
          .filter((line) => line.purchase_draft_line_id === lineId)
          .map((line) => ({
            id: line.id,
            quantity: String(line.quantity),
            supplierLot: line.supplier_lot,
            expirationDate: line.expiration_date ?? '',
            packages: line.packages.map((entry) => ({
              key: crypto.randomUUID(),
              quantity: String(entry.quantity),
              supplierBarcode: entry.supplier_barcode,
            })),
          })),
      ])));
      setRetryLocked(true);
      setResult({
        ok: false,
        message: es
          ? 'Esta entrega aún necesita confirmación. Reintenta exactamente los mismos datos.'
          : 'This delivery still needs confirmation. Retry the exact same submission.',
        retry: 'same_request',
      });
    }, 0);
    return () => window.clearTimeout(timer);
  }, [es, orders, storageKey]);

  function hasEnteredValues(lineIds?: Set<string>) {
    return Object.entries(splitsByLine).some(([lineId, splits]) => (
      (!lineIds || lineIds.has(lineId)) && splits.some((split) => (
        split.quantity !== ''
        || split.supplierLot !== ''
        || split.expirationDate !== ''
        || split.packages.some((entry) => entry.quantity !== '' || entry.supplierBarcode !== '')
      ))
    ));
  }

  function discardStoredRecovery() {
    if (!confirmDiscardStored) {
      setConfirmDiscardStored(true);
      return;
    }
    try {
      window.sessionStorage.removeItem(storageKey);
      setStorageProblem(undefined);
      setConfirmDiscardStored(false);
    } catch {
      setStorageProblem('unavailable');
    }
  }

  function removeStoredPayload() {
    try {
      window.sessionStorage.removeItem(storageKey);
      return true;
    } catch {
      setStorageProblem('unavailable');
      return false;
    }
  }

  function clearReconciledSubmission() {
    if (!confirmReconcile) {
      setConfirmReconcile(true);
      return;
    }
    try {
      window.sessionStorage.removeItem(storageKey);
    } catch {
      setStorageProblem('unavailable');
      return;
    }
    submittedPayload.current = undefined;
    requestId.current = undefined;
    setRetryLocked(false);
    setConfirmReconcile(false);
    setSelectedOrderIds([]);
    setSplitsByLine({});
    setResult(undefined);
  }

  function clearSelection() {
    if (hasEnteredValues() && !confirmClear) {
      setConfirmClear(true);
      setResult({
        ok: false,
        message: es
          ? 'Vuelve a seleccionar Borrar datos ingresados para confirmar.'
          : 'Choose Clear entered data again to confirm.',
        retry: 'new_request',
      });
      return;
    }
    setSelectedOrderIds([]);
    setSplitsByLine({});
    setResult(undefined);
    setConfirmClear(false);
  }

  function toggleOrder(order: PurchaseReceivingOrder) {
    const selected = selectedOrderIds.includes(order.id);
    if (!selected && selectedSupplierId && selectedSupplierId !== order.supplierId) return;
    if (selected) {
      const lineIds = new Set(order.lines.map((line) => line.id));
      if (hasEnteredValues(lineIds)) {
        setResult({
          ok: false,
          message: es
            ? 'Usa Borrar selección para confirmar que deseas descartar los datos ingresados.'
            : 'Use Clear selection to confirm that you want to discard entered delivery data.',
          retry: 'new_request',
        });
        return;
      }
      setSelectedOrderIds((current) => current.filter((id) => id !== order.id));
      setSplitsByLine((current) => Object.fromEntries(
        Object.entries(current).filter(([lineId]) => !lineIds.has(lineId)),
      ));
      return;
    }
    setSelectedOrderIds((current) => [...current, order.id]);
    setConfirmClear(false);
    setSplitsByLine((current) => {
      const next = { ...current };
      order.lines.forEach((line) => {
        if (line.outstanding > 0 && !next[line.id]) next[line.id] = [newSplit()];
      });
      return next;
    });
  }

  function updateSplits(lineId: string, update: (splits: DraftSplit[]) => DraftSplit[]) {
    setSplitsByLine((current) => ({
      ...current,
      [lineId]: update(current[lineId] ?? []),
    }));
  }

  function updateSplit(lineId: string, splitId: string, values: Partial<DraftSplit>) {
    updateSplits(lineId, (splits) => splits.map((split) => (
      split.id === splitId ? { ...split, ...values } : split
    )));
  }

  function updatePackage(
    lineId: string,
    splitId: string,
    packageKey: string,
    values: Partial<DraftPackage>,
  ) {
    updateSplits(lineId, (splits) => splits.map((split) => (
      split.id === splitId
        ? {
          ...split,
          packages: split.packages.map((entry) => (
            entry.key === packageKey ? { ...entry, ...values } : entry
          )),
        }
        : split
    )));
  }

  function fillOutstanding(line: PurchaseReceivingLine) {
    const quantity = String(line.outstanding);
    updateSplits(line.id, (splits) => {
      if (splits.length !== 1) {
        setResult({
          ok: false,
          message: es
            ? 'Ingresa la cantidad real de cada lote de origen por separado.'
            : 'Enter the actual quantity for each source lot separately.',
          retry: 'new_request',
        });
        return splits;
      }
      const [split] = splits;
      if (!split) return [newSplit(quantity)];
      const packages = split.packages.length === 1 && split.packages[0]?.quantity === ''
        ? [{ ...split.packages[0], quantity }]
        : split.packages;
      return [{ ...split, quantity, packages }];
    });
  }

  function buildPayload(): PurchaseDelivery {
    const lines = selectedOrders.flatMap((order) => order.lines.flatMap((line) => {
      const splits = splitsByLine[line.id] ?? [];
      const entered = splits.filter((split) => parseOptionalQuantity(split.quantity) !== 0);
      const actual = entered.reduce(
        (sum, split) => sum + Math.round(parseOptionalQuantity(split.quantity) * QUANTITY_SCALE),
        0,
      ) / QUANTITY_SCALE;
      if (actual > line.outstanding) {
        throw new Error(
          es
            ? `La cantidad real de ${line.ingredientName} excede lo pendiente.`
            : `Actual ${line.ingredientName} quantity exceeds the outstanding amount.`,
        );
      }
      return entered.map((split) => ({
        id: split.id,
        purchase_draft_line_id: line.id,
        quantity: parseOptionalQuantity(split.quantity),
        supplier_lot: split.supplierLot,
        expiration_date: split.expirationDate || null,
        packages: split.packages
          .filter((entry) => parseOptionalQuantity(entry.quantity) !== 0)
          .map((entry) => ({
            quantity: parseOptionalQuantity(entry.quantity),
            supplier_barcode: entry.supplierBarcode,
          })),
      }));
    }));
    requestId.current ??= crypto.randomUUID();
    return purchaseDeliverySchema.parse({
      request_id: requestId.current,
      supplier_id: selectedSupplierId,
      received_on: receivedOn,
      supplier_reference: supplierReference,
      note,
      lines,
    });
  }

  function submit(payload: PurchaseDelivery) {
    submittedPayload.current = payload;
    try {
      window.sessionStorage.setItem(storageKey, JSON.stringify(payload));
    } catch {
      setStorageProblem('unavailable');
      setResult({
        ok: false,
        message: es
          ? 'Este navegador no pudo guardar la identidad de reintento. Habilita el almacenamiento de sesión antes de recibir.'
          : 'This browser could not preserve the retry identity. Enable session storage before receiving.',
        retry: 'new_request',
      });
      return;
    }
    startTransition(async () => {
      let response: PurchaseDeliveryResult;
      try {
        response = await receivePurchaseDelivery(payload);
      } catch {
        response = {
          ok: false,
          message: 'Connection interrupted. Retry the same delivery without editing it.',
          retry: 'same_request',
        };
      }
      setResult({ ...response, message: localMessage(response, locale) });
      if (response.ok) {
        removeStoredPayload();
        submittedPayload.current = undefined;
        requestId.current = undefined;
        setRetryLocked(false);
        setSelectedOrderIds([]);
        setSplitsByLine({});
        setSupplierReference('');
        setNote('');
        router.refresh();
      } else if (response.retry === 'same_request' || response.retry === 'review_existing') {
        setRetryLocked(true);
      } else {
        if (removeStoredPayload()) {
          submittedPayload.current = undefined;
          requestId.current = undefined;
        }
        setRetryLocked(false);
      }
    });
  }

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (disabled) return;
    try {
      submit(buildPayload());
    } catch (error) {
      setResult({
        ok: false,
        message: caughtMessage(error, es),
        retry: 'new_request',
      });
      requestId.current = undefined;
    }
  }

  if (!canReceive) {
    return (
      <section className="panel">
        <h2>{es ? 'Recibir pedidos de compra' : 'Receive purchase orders'}</h2>
        <p role="status">
          {es
            ? 'Tu acceso es de solo lectura. Se requiere permiso de recepción para registrar una entrega.'
            : 'Your access is read-only. Receiving permission is required to post a delivery.'}
        </p>
      </section>
    );
  }

  let discardStoredLabel = es
    ? 'Ya verifiqué; descartar recuperación'
    : 'I verified; discard recovery';
  if (confirmDiscardStored) {
    discardStoredLabel = es
      ? 'Confirmar descarte después de verificar'
      : 'Confirm discard after verifying';
  }
  let clearSelectionLabel = es ? 'Borrar selección' : 'Clear selection';
  if (confirmClear) {
    clearSelectionLabel = es ? 'Borrar datos ingresados' : 'Clear entered data';
  }
  let reconcileLabel = es
    ? 'Ya revisé; borrar entrega pendiente'
    : 'I reviewed it; clear pending delivery';
  if (confirmReconcile) {
    reconcileLabel = es ? 'Confirmar borrado pendiente' : 'Confirm pending clear';
  }
  let retryLabel = es ? 'Reintentar la misma entrega' : 'Retry same delivery';
  if (pending) retryLabel = es ? 'Confirmando…' : 'Confirming…';
  let submitLabel = es
    ? 'Recibir inventario y crear etiquetas'
    : 'Receive inventory & create labels';
  if (pending) submitLabel = es ? 'Recibiendo…' : 'Receiving…';
  const requiresRetry = retryLocked
    && (!result || (!result.ok && result.retry !== 'review_existing'));

  return (
    <section className="panel" aria-busy={pending}>
      <h2>{es ? 'Recibir pedidos de compra' : 'Receive purchase orders'}</h2>
      <p>
        {es
          ? 'Filtra por proveedor y selecciona uno o más pedidos del mismo proveedor. Las cantidades reales comienzan vacías.'
          : 'Filter by supplier and select one or more POs from the same supplier. Actual quantities start blank.'}
      </p>
      {!orders.length && !retryLocked && !storageProblem ? (
        <div className="empty">
          <h3>{es ? 'No hay pedidos abiertos para recibir' : 'No open purchase orders to receive'}</h3>
          <p>{es ? 'Los pedidos confirmados aparecerán aquí hasta recibirse por completo.' : 'Confirmed POs appear here until they are fully received.'}</p>
        </div>
      ) : (
        <form className="record-form" onSubmit={handleSubmit}>
          {storageProblem && (
            <div className="error-notice" role="alert">
              <p>
                {storageProblemMessage(storageProblem, es)}
              </p>
              {storageProblem === 'corrupt' && (
                <button type="button" onClick={discardStoredRecovery}>
                  {discardStoredLabel}
                </button>
              )}
            </div>
          )}
          <fieldset disabled={disabled}>
            <legend>{es ? '1. Selecciona los pedidos' : '1. Select purchase orders'}</legend>
            <label htmlFor={`${componentId}-supplier-filter`}>
              <span>{es ? 'Filtrar por proveedor' : 'Filter by supplier'}</span>
              <select
                id={`${componentId}-supplier-filter`}
                value={supplierFilter}
                onChange={(event) => setSupplierFilter(event.target.value)}
                disabled={selectedOrderIds.length > 0 || disabled}
              >
                <option value="">{es ? 'Todos los proveedores' : 'All suppliers'}</option>
                {suppliers.map(([id, name]) => <option key={id} value={id}>{name}</option>)}
              </select>
              {selectedOrderIds.length > 0 && (
                <small>{es ? 'Borra la selección para cambiar de proveedor.' : 'Clear the selection to change suppliers.'}</small>
              )}
            </label>
            {selectedOrderIds.length > 0 && (
              <button type="button" className="button muted" onClick={clearSelection}>
                {clearSelectionLabel}
              </button>
            )}
            <div className="checks">
              {visibleOrders.map((order) => {
                const checked = selectedOrderIds.includes(order.id);
                const incompatible = Boolean(
                  selectedSupplierId && selectedSupplierId !== order.supplierId,
                );
                return (
                  <label className="check" key={order.id}>
                    <input
                      type="checkbox"
                      checked={checked}
                      disabled={incompatible || disabled}
                      onChange={() => toggleOrder(order)}
                    />
                    <span>
                      <strong>{orderLabel(order, es)}</strong>
                      {` · ${order.supplierName} · ${es ? 'previsto' : 'expected'} ${formatDate(order.expectedOn)}`}
                    </span>
                  </label>
                );
              })}
            </div>
          </fieldset>

          {selectedOrders.map((order) => (
            <fieldset key={order.id} disabled={disabled}>
              <legend>{orderLabel(order, es)}</legend>
              <p>{`${order.supplierName} · ${es ? 'Entrega prevista' : 'Expected delivery'} ${formatDate(order.expectedOn)}`}</p>
              <div className="table-wrap">
                <table>
                  <thead>
                    <tr>
                      {(es
                        ? ['Ingrediente / presentación', 'Pedido', 'Recibido', 'Pendiente', 'Real']
                        : ['Ingredient / pack', 'Ordered', 'Received', 'Outstanding', 'Actual'])
                        .map((heading) => <th scope="col" key={heading}>{heading}</th>)}
                    </tr>
                  </thead>
                  <tbody>
                    {order.lines.map((line) => (
                      <tr key={line.id}>
                        <th scope="row">
                          {line.ingredientName}
                          <small>{` · ${formatNumber(line.packQuantity)} ${line.uom}/${line.purchaseUom} · ${line.supplierSku}`}</small>
                        </th>
                        <td>{`${formatNumber(line.ordered)} ${line.uom}`}</td>
                        <td>{`${formatNumber(line.received)} ${line.uom}`}</td>
                        <td>{`${formatNumber(line.outstanding)} ${line.uom}`}</td>
                        <td>{`${formatNumber(actualQuantity(splitsByLine[line.id] ?? []))} ${line.uom}`}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
              {order.lines.filter((line) => line.outstanding > 0).map((line) => (
                <section key={line.id}>
                  <div className="row">
                    <h3>{line.ingredientName}</h3>
                    <button type="button" onClick={() => fillOutstanding(line)}>
                      {es ? 'Completar toda la cantidad pendiente' : 'Fill full outstanding'}
                    </button>
                  </div>
                  {(splitsByLine[line.id] ?? []).map((split, splitIndex) => (
                    <fieldset key={split.id}>
                      <legend>{`${es ? 'Lote de origen' : 'Source lot'} ${splitIndex + 1}`}</legend>
                      <div className="form-grid">
                        <label htmlFor={`${componentId}-${split.id}-quantity`}>
                          <span>{`${es ? 'Cantidad real' : 'Actual received'} (${line.uom})`}</span>
                          <input
                            id={`${componentId}-${split.id}-quantity`}
                            type="number"
                            min="0"
                            max={line.outstanding}
                            step="0.0001"
                            value={split.quantity}
                            onChange={(event) => updateSplit(line.id, split.id, {
                              quantity: event.target.value,
                            })}
                          />
                          <small>{es ? 'En blanco o cero se omite.' : 'Blank or zero is skipped.'}</small>
                        </label>
                        <label htmlFor={`${componentId}-${split.id}-lot`}>
                          <span>{es ? 'Lote del proveedor' : 'Supplier lot'}</span>
                          <input
                            id={`${componentId}-${split.id}-lot`}
                            maxLength={120}
                            value={split.supplierLot}
                            onChange={(event) => updateSplit(line.id, split.id, {
                              supplierLot: event.target.value,
                            })}
                          />
                          <small>
                            {es
                              ? 'En blanco asigna un lote de origen de Salad Soulmates.'
                              : 'Leave blank for a Salad Soulmates assigned source lot.'}
                          </small>
                        </label>
                        <label htmlFor={`${componentId}-${split.id}-expiration`}>
                          <span>{es ? 'Fecha de vencimiento' : 'Expiration date'}</span>
                          <input
                            id={`${componentId}-${split.id}-expiration`}
                            type="date"
                            value={split.expirationDate}
                            onChange={(event) => updateSplit(line.id, split.id, {
                              expirationDate: event.target.value,
                            })}
                          />
                        </label>
                      </div>
                      <h4>{es ? 'Paquetes físicos' : 'Physical packages'}</h4>
                      {split.packages.map((entry, packageIndex) => (
                        <div className="form-grid" key={entry.key}>
                          <label htmlFor={`${componentId}-${entry.key}-quantity`}>
                            <span>
                              {`${es ? 'Paquete' : 'Package'} ${packageIndex + 1}`}
                              {` · ${es ? 'cantidad' : 'quantity'} (${line.uom})`}
                            </span>
                            <input
                              id={`${componentId}-${entry.key}-quantity`}
                              type="number"
                              min="0"
                              step="0.0001"
                              value={entry.quantity}
                              onChange={(event) => updatePackage(
                                line.id,
                                split.id,
                                entry.key,
                                { quantity: event.target.value },
                              )}
                            />
                          </label>
                          <label htmlFor={`${componentId}-${entry.key}-barcode`}>
                            <span>
                              {es
                                ? 'Código único del proveedor (opcional)'
                                : 'Unique supplier barcode (optional)'}
                            </span>
                            <input
                              id={`${componentId}-${entry.key}-barcode`}
                              maxLength={120}
                              value={entry.supplierBarcode}
                              onChange={(event) => updatePackage(
                                line.id,
                                split.id,
                                entry.key,
                                { supplierBarcode: event.target.value },
                              )}
                            />
                          </label>
                          {split.packages.length > 1 && (
                            <button
                              type="button"
                              onClick={() => updateSplit(line.id, split.id, {
                                packages: split.packages.filter(
                                  (candidate) => candidate.key !== entry.key,
                                ),
                              })}
                            >
                              {es ? 'Quitar paquete' : 'Remove package'}
                            </button>
                          )}
                        </div>
                      ))}
                      <button
                        type="button"
                        onClick={() => updateSplit(line.id, split.id, {
                          packages: [...split.packages, newPackage()],
                        })}
                      >
                        {es ? 'Agregar paquete' : 'Add package'}
                      </button>
                      {(splitsByLine[line.id]?.length ?? 0) > 1 && (
                        <button
                          type="button"
                          onClick={() => updateSplits(line.id, (splits) => (
                            splits.filter((candidate) => candidate.id !== split.id)
                          ))}
                        >
                          {es ? 'Quitar lote de origen' : 'Remove source lot'}
                        </button>
                      )}
                    </fieldset>
                  ))}
                  <button
                    type="button"
                    onClick={() => updateSplits(line.id, (splits) => [...splits, newSplit()])}
                  >
                    {es ? 'Agregar otro lote de origen' : 'Add another source lot'}
                  </button>
                </section>
              ))}
            </fieldset>
          ))}

          {selectedOrders.length > 0 && (
            <fieldset disabled={disabled}>
              <legend>{es ? '2. Detalles de la entrega' : '2. Delivery details'}</legend>
              <div className="form-grid">
                <label htmlFor={`${componentId}-received-on`}>
                  <span>{es ? 'Fecha de recepción *' : 'Received date *'}</span>
                  <input id={`${componentId}-received-on`} type="date" required value={receivedOn} onChange={(event) => setReceivedOn(event.target.value)} />
                </label>
                <label htmlFor={`${componentId}-reference`}>
                  <span>{es ? 'Referencia de la entrega' : 'Delivery reference'}</span>
                  <input id={`${componentId}-reference`} maxLength={120} value={supplierReference} onChange={(event) => setSupplierReference(event.target.value)} />
                </label>
                <label className="wide" htmlFor={`${componentId}-note`}>
                  <span>{es ? 'Notas de recepción' : 'Receiving notes'}</span>
                  <textarea id={`${componentId}-note`} maxLength={1000} value={note} onChange={(event) => setNote(event.target.value)} />
                </label>
              </div>
            </fieldset>
          )}

          {requiresRetry ? (
            <button
              type="button"
              disabled={pending}
              onClick={() => {
                if (submittedPayload.current) submit(submittedPayload.current);
              }}
            >
              {retryLabel}
            </button>
          ) : selectedOrders.length > 0 && (
            <button type="submit" disabled={pending}>
              {submitLabel}
            </button>
          )}
          {result && !result.ok && result.retry === 'review_existing' && (
            <div>
              {result.id ? (
                <Link href={`/receiving/labels?receipt=${result.id}`}>
                  {es ? 'Revisar la recepción existente' : 'Review existing receipt'}
                </Link>
              ) : (
                <a href="#receipt-history">
                  {es ? 'Revisar historial de recepciones' : 'Review receipt history'}
                </a>
              )}
              <button type="button" onClick={clearReconciledSubmission}>
                {reconcileLabel}
              </button>
            </div>
          )}
        </form>
      )}
      {result && (
        <p role={result.ok ? 'status' : 'alert'} className={result.ok ? 'notice' : 'error-notice'}>
          {result.message}
        </p>
      )}
      {result?.ok && (
        <Link href={`/receiving/labels?receipt=${result.id}`}>
          {es ? 'Ver esta recepción e imprimir etiquetas' : 'View this receipt and print labels'}
        </Link>
      )}
    </section>
  );
}
