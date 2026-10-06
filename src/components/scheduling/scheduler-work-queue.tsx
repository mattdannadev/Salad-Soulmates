'use client';

import { useState, useTransition } from 'react';
import { createSchedulerWorkQueueItem, publishSchedulerWorkQueue } from '@/app/app/scheduling/work-queue-actions';
import { workQueueKindLabel } from '@/domain/work-queue';
import type { LinkedTaskOption } from './scheduler';
import {
  schedulerWorkQueueContextTypes, schedulerWorkQueueKinds, schedulerWorkQueueKindSchema,
} from './scheduler-work-queue-options';
import styles from './scheduler.module.css';

const quotaKinds = new Set(['ingredient_prep', 'mixing']);

export default function SchedulerWorkQueue({
  facilityId, initialDate, locale, canManage, linkedTasks,
}: {
  facilityId: string;
  initialDate: string;
  locale: 'en' | 'es';
  canManage: boolean;
  linkedTasks: LinkedTaskOption[];
}) {
  const [workOn, setWorkOn] = useState(initialDate);
  const [kind, setKind] = useState<(typeof schedulerWorkQueueKinds)[number]>('mixing');
  const [title, setTitle] = useState('');
  const [instructions, setInstructions] = useState('');
  const [crew, setCrew] = useState('1');
  const [batchQuota, setBatchQuota] = useState('');
  const [estimatedMinutes, setEstimatedMinutes] = useState('');
  const [linkedTaskValue, setLinkedTaskValue] = useState('');
  const [message, setMessage] = useState('');
  const [pending, startTransition] = useTransition();
  const es = locale === 'es';
  const quotaRequired = quotaKinds.has(kind);
  const contextTypes = schedulerWorkQueueContextTypes[kind];
  const compatibleLinks = linkedTasks.filter((item) => contextTypes.includes(
    item.type,
  ));
  const selectedLink = compatibleLinks.find((item) => `${item.type}:${item.id}` === linkedTaskValue);
  let contextPlaceholder = es ? 'No es necesario' : 'Not required';
  if (contextTypes.length) contextPlaceholder = es ? 'Seleccione contexto' : 'Choose workflow';

  if (!canManage) return null;
  const addWork = () => startTransition(async () => {
    const result = await createSchedulerWorkQueueItem({
      id: crypto.randomUUID(),
      facility_id: facilityId,
      work_on: workOn,
      kind,
      title,
      instructions,
      required_worker_count: Number(crew),
      batch_quota: quotaRequired ? Number(batchQuota) : null,
      estimated_minutes: quotaRequired ? Number(estimatedMinutes) : null,
      linked_task_type: selectedLink?.type ?? null,
      linked_task_id: selectedLink?.id ?? null,
    });
    setMessage(result.message);
    if (result.ok) {
      setTitle('');
      setInstructions('');
      setBatchQuota('');
      setEstimatedMinutes('');
    }
  });
  const publish = () => startTransition(async () => {
    const result = await publishSchedulerWorkQueue({ facility_id: facilityId, work_on: workOn });
    setMessage(result.message);
  });

  return (
    <section className={styles.queueComposer} aria-labelledby="daily-work-heading">
      <div>
        <h2 id="daily-work-heading" tabIndex={-1}>{es ? 'Cola de trabajo' : 'Work queue'}</h2>
        <p>{es ? 'Cree el trabajo y publíquelo. Los trabajadores lo reclaman por separado; no se asigna a nadie aquí.' : 'Create and publish work. Workers claim it separately; no one is assigned here.'}</p>
      </div>
      <div className={styles.queueFields}>
        <label>
          {es ? 'Fecha' : 'Date'}
          <input type="date" value={workOn} onChange={(event) => setWorkOn(event.target.value)} />
        </label>
        <label>
          {es ? 'Trabajo' : 'Work'}
          <select
            value={kind}
            onChange={(event) => {
              const selected = schedulerWorkQueueKindSchema.safeParse(event.target.value);
              if (!selected.success) return;
              setKind(selected.data);
              setLinkedTaskValue('');
            }}
          >
            {schedulerWorkQueueKinds.map((item) => (
              <option value={item} key={item}>{workQueueKindLabel(item, locale)}</option>
            ))}
          </select>
        </label>
        <label>
          {es ? 'Contexto' : 'Workflow context'}
          <select
            value={linkedTaskValue}
            onChange={(event) => setLinkedTaskValue(event.target.value)}
            required={contextTypes.length > 0}
          >
            <option value="">{contextPlaceholder}</option>
            {compatibleLinks.map((item) => <option value={`${item.type}:${item.id}`} key={`${item.type}:${item.id}`}>{item.label}</option>)}
          </select>
        </label>
        <label>
          {es ? 'Trabajadores necesarios' : 'Workers needed'}
          <input type="number" min="1" max="100" value={crew} onChange={(event) => setCrew(event.target.value)} />
        </label>
        {quotaRequired && (
        <label>
          {es ? 'Lotes' : 'Batches'}
          <input type="number" min="1" value={batchQuota} onChange={(event) => setBatchQuota(event.target.value)} />
        </label>
        )}
        {quotaRequired && (
        <label>
          {es ? 'Minutos estimados' : 'Estimated minutes'}
          <input type="number" min="0.25" step="0.25" value={estimatedMinutes} onChange={(event) => setEstimatedMinutes(event.target.value)} />
        </label>
        )}
        <label className={styles.queueTitle}>
          {es ? 'Título' : 'Title'}
          <input value={title} maxLength={120} onChange={(event) => setTitle(event.target.value)} />
        </label>
      </div>
      <label className={styles.queueInstructions}>
        {es ? 'Instrucciones' : 'Instructions'}
        <input
          value={instructions}
          maxLength={2000}
          onChange={(event) => setInstructions(event.target.value)}
        />
      </label>
      <div className={styles.queueActions}>
        <button type="button" className={styles.primary} disabled={pending} onClick={addWork}>{es ? 'Agregar borrador' : 'Add draft'}</button>
        <button type="button" disabled={pending} onClick={publish}>{es ? 'Publicar día' : 'Publish day'}</button>
        {message && <span role="status">{message}</span>}
      </div>
    </section>
  );
}
