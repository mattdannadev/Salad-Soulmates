'use client';

import { useMemo } from 'react';
import { TimeZoneHelper } from '@bryntum/scheduler';
import { BryntumScheduler } from '@bryntum/scheduler-react';
import '@bryntum/scheduler/fontawesome/css/fontawesome.css';
import '@bryntum/scheduler/fontawesome/css/solid.css';
import '@bryntum/scheduler/scheduler.css';
import '@bryntum/scheduler/svalbard-light.css';
import type { BryntumSchedulerProps } from './bryntum-scheduler';
import styles from './bryntum-trial-surface.module.css';

function addCalendarDay(value: string) {
  const date = new Date(`${value}T12:00:00.000Z`);
  date.setUTCDate(date.getUTCDate() + 1);
  return date.toISOString().slice(0, 10);
}

function wallClockDate(
  value: string,
  minute: number,
  sourceTimeZone: string,
  displayTimeZone: string,
) {
  const date = new Date(0);
  date.setFullYear(
    Number(value.slice(0, 4)),
    Number(value.slice(5, 7)) - 1,
    Number(value.slice(8, 10)),
  );
  date.setHours(Math.floor(minute / 60), minute % 60, 0, 0);
  // Bryntum renders dates in the browser's local coordinate system. Round-trip
  // the facility wall time through its timezone helper so DST gaps/offsets are
  // interpreted by the same implementation that positions schedule records.
  const instant = TimeZoneHelper.fromTimeZone(date, sourceTimeZone);
  return TimeZoneHelper.toTimeZone(instant, displayTimeZone);
}

/** Native Bryntum demand board; no custom calendar grid is involved. */
export default function BryntumTrialSurface({
  data, startDate, endDate, locale, canManage, pending, resetVersion,
  onAddWork, onEventSummary, onEdit, onDuplicate, onViewExecutionSchedule, onCreate, onDateChange,
}: BryntumSchedulerProps) {
  const es = locale === 'es';
  const editable = canManage && !pending;
  const resources = useMemo(() => data.resources.map((resource) => ({
    id: resource.id,
    name: resource.name,
    reference: resource.reference,
    pickupDate: resource.pickupDate,
  })), [data.resources]);
  const events = useMemo(() => data.events.map((event) => ({
    id: event.id,
    name: event.name,
    startDate: event.allDay
      ? event.startDate : TimeZoneHelper.toTimeZone(event.startDate, data.timezone),
    endDate: event.allDay
      ? event.endDate : TimeZoneHelper.toTimeZone(event.endDate, data.timezone),
    allDay: event.allDay,
    eventColor: event.eventColor,
    readOnly: Boolean(event.locked) || !editable,
    draggable: !event.locked && editable,
    resizable: !event.locked && editable,
  })), [data.events, data.timezone, editable]);
  const productionTimeRanges = useMemo(() => data.timeRanges.map((range) => ({
    ...range,
    style: 'background-color: rgba(34, 197, 94, 0.09); border-color: rgba(21, 128, 61, 0.42);',
  })), [data.timeRanges]);
  const employeeTimeRanges = useMemo(() => data.resourceTimeRanges.flatMap((range) => {
    const firstDay = range.startDate < startDate ? startDate : range.startDate;
    const lastDay = range.endDate;
    const days = [];
    for (let day = firstDay; day <= lastDay && day < endDate; day = addCalendarDay(day)) {
      days.push({
        id: `${range.id}:${day}`,
        resourceId: range.resourceId,
        name: range.name,
        startDate: wallClockDate(day, range.startMinute, range.timezone, data.timezone),
        endDate: wallClockDate(day, range.endMinute, range.timezone, data.timezone),
        readOnly: true,
        timeRangeColor: 'red',
        style: 'background-color: rgba(220, 38, 38, 0.16); color: #991b1b;',
      });
    }
    return days;
  }), [data.resourceTimeRanges, data.timezone, endDate, startDate]);

  return (
    <section className={styles.surface} aria-label={es ? 'Tablero de trabajo' : 'Work planning board'} aria-busy={pending}>
      <p className={styles.note}>
        {es
          ? `Flujo de trabajo de dos horas (${data.timezone}). Los conectores muestran la secuencia de cada pedido.`
          : `Two-hour work flow (${data.timezone}). Connectors show each order's planned sequence.`}
      </p>
      {canManage ? (
        <div className={styles.actions}>
          <button type="button" className={styles.addWork} disabled={pending} onClick={onAddWork}>
            {es ? 'Agregar trabajo' : 'Add work'}
          </button>
        </div>
      ) : null}
      <BryntumScheduler
        key={`${data.perspective}:${startDate}:${endDate}:${resetVersion}`}
        ariaLabel={es ? 'Tablero de trabajo' : 'Work planning board'}
        height={780}
        startDate={`${startDate}T00:00:00`}
        endDate={`${endDate}T00:00:00`}
        // A two-hour native Bryntum preset keeps the planning board readable
        // while preserving an intentional, visible operating sequence.
        viewPreset={{
          base: 'hourAndDay',
          headers: [
            { unit: 'day', increment: 1, dateFormat: 'ddd, MMM D' },
            { unit: 'hour', increment: 2, dateFormat: 'h A' },
          ],
          tickWidth: 74,
          timeResolution: { unit: 'minute', increment: 30 },
        }}
        barMargin={8}
        rowHeight={64}
        resourceStore={{ tree: data.perspective === 'order', data: resources }}
        treeFeature={data.perspective === 'order'}
        events={events}
        assignments={data.assignments}
        dependencies={data.dependencies}
        timeRanges={productionTimeRanges}
        resourceTimeRanges={employeeTimeRanges}
        timeRangesFeature={{ showHeaderElements: true, showTooltip: true }}
        resourceTimeRangesFeature={{ enableMouseEvents: true }}
        dependenciesFeature={{ disabled: false }}
        columns={[{
          type: 'tree',
          text: es ? 'Cliente y pedido' : 'Customer & order',
          field: 'name',
          width: 280,
        }]}
        readOnly={!editable}
        eventTooltipFeature
        eventDragFeature={{ disabled: !editable }}
        eventResizeFeature={{ disabled: !editable }}
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
        onEventDrop={({ eventRecords }) => {
          const event = eventRecords[0];
          if (event?.startDate instanceof Date && event.endDate instanceof Date) {
            onDateChange(
              String(event.id),
              TimeZoneHelper.fromTimeZone(event.startDate, data.timezone),
              TimeZoneHelper.fromTimeZone(event.endDate, data.timezone),
            ).catch(() => undefined);
          }
        }}
        onEventResizeEnd={({ eventRecord, changed }) => {
          if (!changed) {
            return;
          }
          if (eventRecord.startDate instanceof Date && eventRecord.endDate instanceof Date) {
            onDateChange(
              String(eventRecord.id),
              TimeZoneHelper.fromTimeZone(eventRecord.startDate, data.timezone),
              TimeZoneHelper.fromTimeZone(eventRecord.endDate, data.timezone),
            )
              .catch(() => undefined);
          }
        }}
        onScheduleClick={({ date, resourceRecord }) => {
          if (editable) {
            const proposedEnd = new Date(date.getTime() + 60 * 60 * 1000);
            onCreate(
              TimeZoneHelper.fromTimeZone(date, data.timezone),
              TimeZoneHelper.fromTimeZone(proposedEnd, data.timezone),
              String(resourceRecord.id),
            );
          }
        }}
      />
    </section>
  );
}
