'use client';

import { useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { AlertTriangle, Check, ChevronRight, Pencil } from 'lucide-react';
import saveBatchWorksheet from '@/app/batch-worksheet-actions';
import { formatNumber } from '@/domain/format';
import type { WorkerLine, WorkerPreparation } from '@/domain/worker-preparations';

function quantityLeft(line: WorkerLine) {
  return Math.max(0, Math.round((line.required_quantity
    - line.usages.reduce((total, usage) => total + usage.quantity, 0)) * 10000) / 10000);
}

function IngredientEntry({ line, preparation, locale, onSaved }: {
  line: WorkerLine;
  preparation: WorkerPreparation;
  locale: 'en' | 'es';
  onSaved: (message: string, ok: boolean) => void;
}) {
  const es = locale === 'es';
  const [packageId, setPackageId] = useState('');
  const [quantity, setQuantity] = useState(String(quantityLeft(line)));
  const [editingUsage, setEditingUsage] = useState<string | null>(null);
  const [correctionQuantity, setCorrectionQuantity] = useState('');
  const [correctionReason, setCorrectionReason] = useState('');
  const [reporting, setReporting] = useState(false);
  const [issueCategory, setIssueCategory] = useState<'Spice' | 'Bucket'>('Spice');
  const [issuePackageId, setIssuePackageId] = useState('');
  const [issueNote, setIssueNote] = useState('');
  const [pending, startTransition] = useTransition();
  const request = useRef<{ key: string; id: string } | null>(null);
  const correctionRequest = useRef<{ key: string; id: string } | null>(null);
  const issueRequest = useRef<{ key: string; id: string } | null>(null);
  const selected = line.packages.find((item) => item.id === packageId);
  const left = quantityLeft(line);
  const canEdit = preparation.status === 'Open' && Boolean(line.id);
  const issues = preparation.issues
    .filter((issue) => issue.worksheet_line_id === line.id);
  const bucketOptions = [...new Map([
    ...line.packages.map((item) => [item.id, `${item.source_lot} · ${item.internal_code}`] as const),
    ...line.usages.map((usage) => [usage.serialized_unit_id, usage.source_lot] as const),
  ]).entries()];
  return (
    <div className="worker-ingredient-entry">
      <div className="worker-ingredient-heading">
        <div><p className="worker-kicker">{es ? 'Ingrediente actual' : 'Current ingredient'}</p><h4>{line.ingredient_name}</h4></div>
        {left === 0 && <span className="worker-done"><Check size={16} />{es ? 'Listo' : 'Done'}</span>}
      </div>
      <div className="worker-quantity-line">
        <span>{es ? 'Necesario' : 'Needed'} <strong>{formatNumber(line.required_quantity)} {line.uom}</strong></span>
        <span>{es ? 'Falta' : 'Remaining'} <strong>{formatNumber(left)} {line.uom}</strong></span>
      </div>
      {line.usages.length > 0 && (
        <div className="worker-lot-records">
          <strong>{es ? 'Lotes registrados' : 'Recorded lots'}</strong>
          {line.usages.map((usage) => (
            <div key={usage.id} className="worker-record">
              <div className="worker-record-summary">
                <span>{`${usage.source_lot} · ${formatNumber(usage.quantity)} ${line.uom}`}</span>
                {canEdit && <button type="button" className="worker-text-button" disabled={pending}
                  aria-expanded={editingUsage === usage.id} onClick={() => {
                    setEditingUsage(editingUsage === usage.id ? null : usage.id);
                    setCorrectionQuantity(String(usage.quantity));
                    setCorrectionReason('');
                  }}><Pencil size={15} aria-hidden="true" />{es ? 'Cambiar' : 'Change'}</button>}
              </div>
              {canEdit && editingUsage === usage.id && <form className="worker-inline-form" onSubmit={(event) => {
                event.preventDefault();
                startTransition(async () => {
                  const key = `${usage.id}:${correctionQuantity}:${correctionReason.trim()}`;
                  const id = correctionRequest.current?.key === key ? correctionRequest.current.id : crypto.randomUUID();
                  correctionRequest.current = { key, id };
                  const result = await saveBatchWorksheet('correct', {
                    id, usage_id: usage.id,
                    restored_quantity: Number(correctionQuantity), reason: correctionReason.trim(),
                  });
                  if (result.ok) { correctionRequest.current = null; setEditingUsage(null); }
                  onSaved(result.message, result.ok);
                });
              }}>
                <p className="worker-hint">{es ? 'Devuelve esta cantidad. Después registra el lote correcto.' : 'Return this amount, then record the correct lot.'}</p>
                <label>{`${es ? 'Cantidad a devolver' : 'Amount to return'} (${line.uom})`}
                  <input type="number" min="0.0001" max={usage.quantity} step="0.0001" required value={correctionQuantity}
                    onChange={(event) => setCorrectionQuantity(event.currentTarget.value)} />
                </label>
                <label>{es ? 'Motivo' : 'Reason'}
                  <input required minLength={3} maxLength={1000} value={correctionReason}
                    onChange={(event) => setCorrectionReason(event.currentTarget.value)} placeholder={es ? 'Ej. Lote equivocado' : 'e.g. Wrong lot'} />
                </label>
                <div className="worker-inline-actions">
                  <button type="button" className="secondary" onClick={() => setEditingUsage(null)}>{es ? 'Cancelar' : 'Cancel'}</button>
                  <button type="submit" disabled={pending || Number(correctionQuantity) <= 0
                    || Number(correctionQuantity) > usage.quantity || correctionReason.trim().length < 3}>
                    {pending ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar cambio' : 'Save change')}
                  </button>
                </div>
              </form>}
            </div>
          ))}
        </div>
      )}
      {left > 0 && canEdit && line.id && (
        <form onSubmit={(event) => {
          event.preventDefault();
          if (!selected) return;
          startTransition(async () => {
            const key = `${line.id}:${selected.id}:${quantity}`;
            const requestId = request.current?.key === key ? request.current.id : crypto.randomUUID();
            request.current = { key, id: requestId };
            const recordedQuantity = Number(quantity);
            const result = await saveBatchWorksheet('use', {
              id: requestId,
              worksheet_line_id: line.id,
              serialized_unit_id: selected.id,
              quantity: recordedQuantity,
            });
            if (result.ok) request.current = null;
            onSaved(result.message, result.ok);
          });
        }}>
          <label>
            {es ? 'Lote del ingrediente / paquete' : 'Ingredient lot / package'}
            <select required value={packageId} onChange={(event) => {
              const next = line.packages.find((item) => item.id === event.currentTarget.value);
              setPackageId(event.currentTarget.value);
              setQuantity(String(next ? Math.min(left, next.remaining_quantity) : left));
            }}>
              <option value="">{es ? 'Selecciona un lote disponible' : 'Select an available lot'}</option>
              {line.packages.filter((item) => item.availability === 'Available'
                && item.remaining_quantity > 0 && item.source_lot).map((item) => (
                <option key={item.id} value={item.id}>
                  {`${item.source_lot} · ${item.internal_code} · ${formatNumber(item.remaining_quantity)} ${line.uom}`}
                </option>
              ))}
            </select>
          </label>
          <label>
            {`${es ? 'Cantidad de este lote' : 'Quantity from this lot'} (${line.uom})`}
            <input type="number" min="0.0001" max={Math.min(left, selected?.remaining_quantity ?? left)} step="0.0001"
              required value={quantity} onChange={(event) => setQuantity(event.currentTarget.value)} />
          </label>
          <button type="submit" disabled={pending || !selected || Number(quantity) <= 0
            || Number(quantity) > left || Number(quantity) > selected.remaining_quantity}>
            {pending ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar y seguir' : 'Save and continue')}
            {!pending && <ChevronRight size={18} aria-hidden="true" />}
          </button>
          {line.packages.length === 0 && <p role="alert">{es ? 'No hay paquetes disponibles para este ingrediente.' : 'No available packages for this ingredient.'}</p>}
        </form>
      )}
      {issues.length > 0 && <div className="worker-issues" aria-label={es ? 'Problemas anotados' : 'Reported problems'}>
        {issues.map((issue) => <p key={issue.id}><AlertTriangle size={15} aria-hidden="true" />
          <span><strong>{issue.category === 'Bucket' ? (es ? 'Cubeta' : 'Bucket') : (es ? 'Especia' : 'Spice')}</strong> · {issue.note}</span></p>)}
      </div>}
      {canEdit && <div className="worker-report">
        <button type="button" className="worker-text-button" aria-expanded={reporting} onClick={() => setReporting(!reporting)}>
          <AlertTriangle size={16} aria-hidden="true" />{es ? 'Reportar un problema' : 'Report a problem'}
        </button>
        {reporting && <form className="worker-inline-form" onSubmit={(event) => {
          event.preventDefault();
          if (!preparation.execution_id || !line.id) return;
          startTransition(async () => {
            const key = `${line.id}:${issueCategory}:${issuePackageId}:${issueNote.trim()}`;
            const id = issueRequest.current?.key === key ? issueRequest.current.id : crypto.randomUUID();
            issueRequest.current = { key, id };
            const result = await saveBatchWorksheet('issue', {
              id, execution_id: preparation.execution_id,
              worksheet_line_id: line.id,
              serialized_unit_id: issueCategory === 'Bucket' ? issuePackageId : undefined,
              category: issueCategory, note: issueNote.trim(),
            });
            if (result.ok) { issueRequest.current = null; setReporting(false); setIssueNote(''); }
            onSaved(result.message, result.ok);
          });
        }}>
          <fieldset className="worker-issue-type"><legend>{es ? '¿Dónde está el problema?' : 'What has a problem?'}</legend>
            <label><input type="radio" name={`issue-${line.id}`} checked={issueCategory === 'Spice'}
              onChange={() => setIssueCategory('Spice')} />{es ? 'Especia' : 'Spice'}</label>
            <label><input type="radio" name={`issue-${line.id}`} checked={issueCategory === 'Bucket'}
              onChange={() => setIssueCategory('Bucket')} />{es ? 'Cubeta' : 'Bucket'}</label>
          </fieldset>
          {issueCategory === 'Bucket' && <label>{es ? 'Cubeta / lote' : 'Bucket / lot'}
            <select required value={issuePackageId} onChange={(event) => setIssuePackageId(event.currentTarget.value)}>
              <option value="">{es ? 'Seleccionar cubeta' : 'Select bucket'}</option>
              {bucketOptions.map(([id, label]) => <option key={id} value={id}>{label}</option>)}
            </select>
          </label>}
          <label>{es ? '¿Qué pasó?' : 'What happened?'}
            <textarea required minLength={3} maxLength={1000} rows={2} value={issueNote}
              onChange={(event) => setIssueNote(event.currentTarget.value)} placeholder={es ? 'Nota breve para el equipo' : 'A short note for the team'} />
          </label>
          <div className="worker-inline-actions">
            <button type="button" className="secondary" onClick={() => setReporting(false)}>{es ? 'Cancelar' : 'Cancel'}</button>
            <button type="submit" disabled={pending || issueNote.trim().length < 3 || (issueCategory === 'Bucket' && !issuePackageId)}>
              {pending ? (es ? 'Guardando…' : 'Saving…') : (es ? 'Guardar nota' : 'Save note')}
            </button>
          </div>
        </form>}
      </div>}
    </div>
  );
}

function PreparationCard({ preparation, locale }: { preparation: WorkerPreparation; locale: 'en' | 'es' }) {
  const es = locale === 'es';
  const router = useRouter();
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const lines = preparation.lines.toSorted((a, b) => a.sequence - b.sequence);
  const completeCount = lines.filter((line) => quantityLeft(line) === 0 && line.id).length;
  const ready = lines.length > 0 && completeCount === lines.length;
  const onSaved = (resultMessage: string, ok: boolean) => {
    setMessage(resultMessage);
    if (ok) {
      router.refresh();
    }
  };
  return (
    <article className="panel worker-preparation">
      <div className="worker-card-top">
        <div>
          <p className="worker-kicker">{es ? 'Lote de producción' : 'Production lot'} {preparation.production_lot_code}</p>
          <h3>{preparation.product_name}</h3>
          <p className="worker-card-subtitle">{es ? 'Mezcla' : 'Mix'} {preparation.sequence} · {formatNumber(preparation.target_gallons)} gal</p>
        </div>
        <span className="badge">{preparation.status === 'Complete' ? (es ? 'Lista' : 'Complete')
          : preparation.status === 'Open' ? (es ? 'En preparación' : 'In preparation')
            : (es ? 'Pendiente' : 'Not started')}</span>
      </div>
      <div className="worker-progress" aria-label={`${completeCount} / ${lines.length}`}>
        <div><span>{`${completeCount} / ${lines.length} ${es ? 'ingredientes' : 'ingredients'}`}</span><span>{Math.round(100 * completeCount / Math.max(lines.length, 1))}%</span></div>
        <progress max={Math.max(lines.length, 1)} value={completeCount} />
      </div>
      {preparation.status === 'Not started' && (
        <button type="button" disabled={pending} onClick={() => startTransition(async () => {
          const result = await saveBatchWorksheet('open', preparation.planned_mixer_batch_id);
          onSaved(result.message, result.ok);
        })}>{es ? 'Comenzar preparación' : 'Start preparation'}</button>
      )}
      <section className="worker-full-ingredient-list" aria-label={es ? 'Todos los ingredientes' : 'All ingredients'}>
        <h4>{es ? 'Todos los ingredientes' : 'All ingredients'}</h4>
        <p className="worker-hint">{es ? 'Registra los ingredientes en el orden que funcione para tu preparación.' : 'Record ingredients in the order that works for your preparation.'}</p>
        {lines.map((line) => (
          preparation.status === 'Not started'
            ? <div className="worker-ingredient-preview" key={`${line.ingredient_id}-${line.sequence}`}><span>{line.ingredient_name}</span><strong>{`${formatNumber(line.required_quantity)} ${line.uom}`}</strong></div>
            : <IngredientEntry key={`${line.id ?? line.ingredient_id}-${line.usages.map((usage) => `${usage.id}:${usage.quantity}`).join(',')}`} line={line}
              preparation={preparation} locale={locale} onSaved={onSaved} />
        ))}
      </section>
      {preparation.status !== 'Not started' && (
        <>
          {preparation.status === 'Open' && (
            <button type="button" disabled={pending || !ready} onClick={() => startTransition(async () => {
              const result = await saveBatchWorksheet('complete', preparation.execution_id);
              onSaved(result.message, result.ok);
            })}>{es ? 'Completar preparación y descontar inventario' : 'Complete preparation and relieve inventory'}</button>
          )}
        </>
      )}
      {message && <p role="status">{message}</p>}
    </article>
  );
}

export default function WorkerPreparations({ preparations, locale }: {
  preparations: WorkerPreparation[]; locale: 'en' | 'es';
}) {
  return <div>{preparations.map((item) => <PreparationCard key={item.planned_mixer_batch_id} preparation={item} locale={locale} />)}</div>;
}
