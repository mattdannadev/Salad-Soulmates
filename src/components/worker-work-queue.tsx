'use client';

import { useState, useTransition } from 'react';
import type { ActionResult } from '@/domain/master-data';
import { workQueueKindLabel } from '@/domain/work-queue';
import type { WorkerQueueItem } from '@/domain/work-queue';

interface WorkerWorkQueueProps {
  items: WorkerQueueItem[];
  locale: 'en' | 'es';
  claim: (input: { id: string; revision: number }) => Promise<ActionResult>;
}

export default function WorkerWorkQueue({ items, locale, claim }: WorkerWorkQueueProps) {
  const [pending, startTransition] = useTransition();
  const [message, setMessage] = useState<string | null>(null);
  const queueDescription = locale === 'es'
    ? 'Elige una tarea publicada para agregarla a tu trabajo.'
    : 'Claim a published task to add it to your work.';

  if (!items.length) return null;
  return (
    <section className="panel" aria-labelledby="available-work-heading">
      <div className="section-heading">
        <h2 id="available-work-heading">{locale === 'es' ? 'Trabajo disponible' : 'Available work'}</h2>
        <span className="badge">{items.length}</span>
      </div>
      <p>{queueDescription}</p>
      {message && <p role="status">{message}</p>}
      {items.map((item) => {
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
              <p>{locale === 'es' ? 'Ya aceptaste esta tarea.' : 'You claimed this task.'}</p>
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
    </section>
  );
}
