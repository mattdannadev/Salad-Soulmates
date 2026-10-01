'use client';

import { useState, useTransition } from 'react';
import type { ActionResult } from '@/domain/master-data';
import { workQueueKindLabel } from '@/domain/work-queue';
import type { WorkerQueueItem } from '@/domain/work-queue';

interface WorkerWorkQueueProps {
  items: WorkerQueueItem[];
  locale: 'en' | 'es';
  claim: (input: { id: string; revision: number }) => Promise<ActionResult>;
  unclaim: (input: { id: string; revision: number }) => Promise<ActionResult>;
}

function weekStart(date: string): string {
  const value = new Date(`${date}T00:00:00Z`);
  value.setUTCDate(value.getUTCDate() - ((value.getUTCDay() + 6) % 7));
  return value.toISOString().slice(0, 10);
}

export default function WorkerWorkQueue({ items, locale, claim, unclaim }: WorkerWorkQueueProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const queueDescription = locale === 'es'
    ? 'Elige una tarea publicada para agregarla a tu trabajo.'
    : 'Claim a published task to add it to your work.';

  if (!items.length) return null;
  const weeks = items.reduce<Record<string, WorkerQueueItem[]>>((groups, item) => {
    const start = weekStart(item.work_on);
    groups[start] = [...(groups[start] ?? []), item];
    return groups;
  }, {});
  return (
    <section className="panel" aria-labelledby="available-work-heading">
      <div className="section-heading">
        <h2 id="available-work-heading">{locale === 'es' ? 'Trabajo disponible' : 'Available work'}</h2>
        <span className="badge">{items.length}</span>
      </div>
      <p>{queueDescription}</p>
      {message && <p role="status">{message}</p>}
      {Object.entries(weeks).map(([start, weekItems]) => <section key={start} aria-label={`${locale === 'es' ? 'Semana de' : 'Week of'} ${start}`}>
        <h3>{locale === 'es' ? 'Semana de' : 'Week of'} {start}</h3>
        {weekItems.map((item) => {
        const openSlots = Math.max(0, item.required_worker_count - item.claimed_worker_count);
        return (
          <article className="panel" key={item.id}>
            <h3>{item.title || workQueueKindLabel(item.kind, locale)}</h3>
            <p>{workQueueKindLabel(item.kind, locale)}</p>
            {item.instructions && <p>{item.instructions}</p>}
            <p>
              {locale === 'es' ? 'Equipo' : 'Crew'}
              :
              {' '}
              {item.claimed_worker_count}
              {' / '}
              {item.required_worker_count}
            </p>
            {item.claimed_by_me ? (
              <div>
                <p>{locale === 'es' ? 'Ya aceptaste esta tarea.' : 'You claimed this task.'}</p>
                <button className="button secondary" disabled={pending} type="button" onClick={() => startTransition(async () => {
                  const result = await unclaim({ id: item.id, revision: item.revision });
                  setMessage(result.message);
                })}>
                  {pending ? (locale === 'es' ? 'Devolviendo…' : 'Returning…') : (locale === 'es' ? 'Devolver a la cola' : 'Return to queue')}
                </button>
              </div>
            ) : (
              <button
                className="button"
                disabled={pending || openSlots === 0}
                type="button"
                onClick={() => startTransition(async () => {
                  const result = await claim({ id: item.id, revision: item.revision });
                  setMessage(result.message);
                })}
              >
                {pending && (locale === 'es' ? 'Aceptando…' : 'Claiming…')}
                {!pending && (locale === 'es' ? 'Aceptar tarea' : 'Claim task')}
              </button>
            )}
          </article>
        );
        })}
      </section>)}
    </section>
  );
}
