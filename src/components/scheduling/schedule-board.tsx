'use client';

import { scheduleKindLabel } from '@/domain/scheduling';
import type { BryntumSchedulerProps } from './bryntum-scheduler';

/**
 * Dependency-free operational schedule surface. It keeps planning usable in
 * production without requiring a private trial-package registry at build time.
 */
export default function ScheduleBoard({
  data, locale, canManage, pending, focusedWorkId, onAddWork, onEventSummary, onEdit, onDelete,
}: BryntumSchedulerProps) {
  const events = [...data.events].sort((a, b) => a.startDate.getTime() - b.startDate.getTime());
  return (
    <section aria-label={locale === 'es' ? 'Programa de trabajo' : 'Work schedule'}>
      {canManage && (
        <p>
          <button type="button" disabled={pending} onClick={onAddWork}>
            {locale === 'es' ? 'Agregar trabajo' : 'Add work'}
          </button>
        </p>
      )}
      <ol>
        {events.map((event) => {
          const focused = event.id === focusedWorkId;
          const date = event.startDate.toLocaleDateString(locale === 'es' ? 'es-MX' : 'en-US', {
            month: 'short', day: 'numeric', year: 'numeric',
          });
          const assignedLabel = locale === 'es' ? 'asignado(s)' : 'assigned';
          const unassignedLabel = locale === 'es' ? 'Sin asignar' : 'Unassigned';
          const assignmentLabel = event.assignedResources.length
            ? `${event.assignedResources.length} ${assignedLabel}`
            : unassignedLabel;
          return (
            <li key={event.id} aria-current={focused ? 'true' : undefined}>
              <strong>{event.name || scheduleKindLabel(event.workType, locale)}</strong>
              {' — '}
              {date}
              {' · '}
              {assignmentLabel}
              {' '}
              <button type="button" onClick={() => onEventSummary(event.id)}>
                {locale === 'es' ? 'Ver' : 'View'}
              </button>
              {canManage && (
                <button type="button" disabled={pending} onClick={() => onEdit(event.id)}>
                  {locale === 'es' ? 'Editar' : 'Edit'}
                </button>
              )}
              {canManage && onDelete && (
                <button type="button" disabled={pending} onClick={() => onDelete(event.id)}>
                  {locale === 'es' ? 'Eliminar' : 'Delete'}
                </button>
              )}
            </li>
          );
        })}
      </ol>
      {!events.length && <p>{locale === 'es' ? 'No hay trabajo en este período.' : 'No work is scheduled for this period.'}</p>}
    </section>
  );
}
