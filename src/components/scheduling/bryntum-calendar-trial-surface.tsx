'use client';

import { useMemo } from 'react';
import { BryntumCalendar } from '@bryntum/calendar-react';
import '@bryntum/calendar/fontawesome/css/fontawesome.css';
import '@bryntum/calendar/fontawesome/css/solid.css';
import '@bryntum/calendar/calendar.css';
import '@bryntum/calendar/stockholm-light.css';
import type { BryntumSchedulerProps } from './bryntum-scheduler';
import styles from './bryntum-trial-surface.module.css';

function nearestWorkHour(value: Date) {
  const rounded = new Date(value);
  rounded.setMinutes(0, 0, 0);
  if (value.getMinutes() >= 30) {
    rounded.setHours(rounded.getHours() + 1);
  }
  return rounded;
}

function workPillClass(type: string) {
  if (type === 'ingredient_prep' || type === 'receiving') return 'work-pill-prep';
  if (type === 'packaging') return 'work-pill-packaging';
  if (['mixing', 'pre_op', 'post_op', 'cleaning'].includes(type)) return 'work-pill-production';
  return 'work-pill-other';
}

/** Native daily execution surface, complementary to the production board. */
export default function BryntumCalendarTrialSurface({
  data,
  startDate,
  endDate,
  locale,
  canManage,
  pending,
  resetVersion,
  focusedWorkId,
  onAddWork,
  onEventSummary,
  onEdit,
  onDuplicate,
  onViewExecutionSchedule,
  onCreate,
  onDateChange,
}: BryntumSchedulerProps) {
  const es = locale === 'es';
  const editable = canManage && !pending;
  const unassignedLabel = es ? 'Sin asignar' : 'Unassigned';
  const cards = useMemo(
    () => new Map(
      data.events.map((event) => [
        event.id,
        {
          title: event.calendarTitle ?? event.name,
          context: event.calendarContext ?? [],
          orderReference: event.orderReference ?? null,
          batches:
              event.batchCount == null ? null : `${event.batchCount} ${es ? 'lotes' : 'batches'}`,
          resources: event.assignedResources.length
            ? event.assignedResources.join(', ')
            : unassignedLabel,
        },
      ]),
    ),
    [data.events, es, unassignedLabel],
  );
  const events = useMemo(
    () => data.events.map((event) => ({
      id: event.id,
      name: [
        event.calendarName ?? event.name,
        event.batchCount == null ? null : `${event.batchCount} ${es ? 'lotes' : 'batches'}`,
        event.assignedResources.length ? event.assignedResources.join(', ') : unassignedLabel,
      ]
        .filter(Boolean)
        .join(' · '),
      allDay: event.allDay,
      startDate: event.startDate,
      endDate: event.endDate,
      eventColor: event.eventColor,
      cls: [
        workPillClass(event.workType),
        event.orderAccent,
        event.id === focusedWorkId ? 'focused-work' : '',
      ]
        .filter(Boolean)
        .join(' '),
      readOnly: Boolean(event.locked) || !editable,
      draggable: !event.locked && editable,
      resizable: !event.locked && editable,
    })),
    [data.events, editable, es, focusedWorkId, unassignedLabel],
  );
  const productionTimeRanges = useMemo(
    () => data.timeRanges.map((range) => ({
      ...range,
      style: 'background-color: rgba(34, 197, 94, 0.09); border-color: rgba(21, 128, 61, 0.42);',
    })),
    [data.timeRanges],
  );

  // Bryntum completes its native drop transaction after firing these callbacks.
  // Keep the route refresh that follows persistence out of that transaction;
  // remounting the Calendar while it is finalizing a drop corrupts its runtime.
  function persistMovedEvent(eventRecord: {
    id: string | number;
    startDate: Date | string;
    endDate: Date | string;
  }) {
    if (!(eventRecord.startDate instanceof Date) || !(eventRecord.endDate instanceof Date)) return;
    const id = String(eventRecord.id);
    const start = new Date(eventRecord.startDate);
    const end = new Date(eventRecord.endDate);
    window.setTimeout(() => {
      onDateChange(id, start, end).catch(() => undefined);
    }, 0);
  }

  return (
    <section
      className={styles.surface}
      aria-label={es ? 'Calendario de ejecución' : 'Execution calendar'}
      aria-busy={pending}
    >
      <p className={styles.note}>
        {es
          ? `Trabajo por día (${data.timezone}). Use Semana anterior y Semana siguiente para recorrer el calendario.`
          : `Work by day (${data.timezone}). Use Previous week and Next week to move through the calendar.`}
      </p>
      {canManage ? (
        <div className={styles.actions}>
          <button type="button" className={styles.addWork} disabled={pending} onClick={onAddWork}>
            {es ? 'Agregar trabajo' : 'Add work'}
          </button>
        </div>
      ) : null}
      <BryntumCalendar
        key={`${startDate}:${endDate}:${resetVersion}`}
        ariaLabel={es ? 'Calendario de ejecución' : 'Execution calendar'}
        height={780}
        date={`${startDate}T00:00:00`}
        mode="dayagenda"
        weekStartDay={1}
        hideNonWorkingDays
        modes={{
          dayagenda: {
            hideNonWorkingDays: true,
            nonWorkingDays: { 0: true, 6: true },
            range: '1 week',
            shiftIncrement: '1 week',
            // Stack work in day columns without exposing hourly geometry.
            // Keep real timestamps intact for persistence and event details.
            hideTimeAxis: true,
            hideEmptyHours: true,
            hideBorders: true,
            showTime: false,
            showAllDayHeader: false,
            dayStartTime: '00:00',
            dayEndTime: '24:00',
            eventFlowDirection: 'column',
            allowDragResize: false,
            eventRenderer: ({ eventRecord, renderData }) => {
              Object.assign(renderData, { solidBar: true, showBullet: false });
              const card = cards.get(String(eventRecord.id));
              if (!card) return { tag: 'span', text: String(eventRecord.name) };
              return {
                tag: 'span',
                className: styles.calendarPillLabel,
                title: String(eventRecord.name),
                'aria-label': String(eventRecord.name),
                children: [
                  { tag: 'span', className: styles.calendarPillTitle, text: card.title },
                  ...(card.orderReference
                    ? [
                      {
                        tag: 'span',
                        className: styles.calendarPillOrder,
                        text: `${es ? 'Pedido' : 'Order'} ${card.orderReference}`,
                      },
                    ]
                    : []),
                  ...card.context.map((text) => ({
                    tag: 'span',
                    className: styles.calendarPillContext,
                    text,
                  })),
                  {
                    tag: 'span',
                    className: styles.calendarPillMetadata,
                    children: [
                      ...(card.batches
                        ? [{ tag: 'span', className: styles.calendarPillBadge, text: card.batches }]
                        : []),
                      {
                        tag: 'span',
                        className: styles.calendarPillResources,
                        text: card.resources,
                      },
                    ],
                  },
                ],
              };
            },
          },
          week: false,
          day: false,
          month: false,
          year: false,
          agenda: false,
        }}
        tbar={{
          items: {
            prevButton: {
              text: es ? 'Semana anterior' : 'Previous week',
              ariaLabel: es ? 'Semana anterior' : 'Previous week',
            },
            nextButton: {
              text: es ? 'Semana siguiente' : 'Next week',
              ariaLabel: es ? 'Semana siguiente' : 'Next week',
            },
          },
        }}
        events={events}
        timeRanges={productionTimeRanges}
        timeRangesFeature={{ showHeaderElements: true, showTooltip: true }}
        readOnly={!editable}
        sidebar={false}
        ui="plain"
        eventTooltipFeature
        dragFeature={{
          creatable: false,
          draggable: editable,
          resizable: false,
          tooltip: true,
        }}
        eventEditFeature={false}
        eventMenuFeature={{
          processItems: ({ eventRecord, items }) => {
            const id = String(eventRecord.id);
            if (id.startsWith('pickup:') || id.startsWith('delivery:')) {
              return false;
            }
            Object.assign(items, {
              deleteEvent: false,
              duplicateEvent: false,
              viewExecutionSchedule: {
                text: es ? 'Ver calendario de ejecución' : 'View execution schedule',
                icon: 'b-fa b-fa-calendar',
                weight: 90,
                onItem: () => onViewExecutionSchedule(id),
              },
            });
            if (editable && !eventRecord.readOnly) {
              Object.assign(items, {
                edit: {
                  text: es ? 'Editar' : 'Edit',
                  icon: 'b-fa b-fa-pen',
                  weight: 95,
                  onItem: () => onEdit(id),
                },
                duplicate: {
                  text: es ? 'Duplicar en otro día' : 'Duplicate to another day',
                  icon: 'b-fa b-fa-copy',
                  weight: 100,
                  onItem: () => onDuplicate(id),
                },
              });
            }
            return undefined;
          },
        }}
        onEventClick={({ eventRecord }) => onEventSummary(String(eventRecord.id))}
        onDragResizeEnd={({ eventRecord }) => persistMovedEvent(eventRecord)}
        onDragMoveEnd={({ eventRecord }) => persistMovedEvent(eventRecord)}
        onScheduleClick={({ date }) => {
          if (editable) {
            const start = nearestWorkHour(date);
            onCreate(start, new Date(start.getTime() + 60 * 60 * 1000), '');
          }
        }}
      />
    </section>
  );
}
