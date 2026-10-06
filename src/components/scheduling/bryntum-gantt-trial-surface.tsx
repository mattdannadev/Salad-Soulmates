'use client';

import {
  useEffect, useMemo, useRef, useState, type KeyboardEvent,
} from 'react';
import { BryntumGantt } from '@bryntum/gantt-react';
import { ProjectModel, type TaskModel } from '@bryntum/gantt';
import { logFailure } from '@/lib/operation-error';
import '@bryntum/gantt/fontawesome/css/fontawesome.css';
import '@bryntum/gantt/fontawesome/css/solid.css';
import '@bryntum/gantt/gantt.css';
import '@bryntum/gantt/stockholm-light.css';
import type { BryntumSchedulerProps } from './bryntum-scheduler';
import styles from './bryntum-trial-surface.module.css';

interface GanttTask {
  id: string;
  sourceEventId?: string;
  creationResourceId?: string;
  milestone?: boolean;
  duration?: number;
  name: string;
  context?: string;
  workLabel?: string;
  productDateLabel?: string;
  peopleLabel?: string;
  batchLabel?: string;
  publicationLabel?: string;
  completionLabel?: string;
  scheduleLabel?: string;
  progressLabel?: string;
  percentDone?: number;
  cls?: string;
  manuallyScheduled?: boolean;
  expanded?: boolean;
  startDate?: Date;
  endDate?: Date;
  eventColor?: string;
  readOnly?: boolean;
  draggable?: boolean;
  resizable?: boolean;
  children?: GanttTask[];
}

function workPillClass(type: string) {
  if (type === 'ingredient_prep' || type === 'receiving') return 'work-pill-prep';
  if (type === 'packaging') return 'work-pill-packaging';
  if (['mixing', 'pre_op', 'post_op', 'cleaning'].includes(type)) return 'work-pill-production';
  return 'work-pill-other';
}

function workflowSummaryClass(resourceId: string) {
  const area = resourceId.split(':area:')[1];
  if (!area) return undefined;
  const workTypes: Record<string, string> = {
    preparation: 'ingredient_prep',
    production: 'mixing',
    packaging: 'packaging',
    shipping: 'shipment_loading',
  };
  const type = workTypes[area];
  return type ? `work-summary ${workPillClass(type)}` : undefined;
}

function escapeHtml(value: string) {
  return value.replace(/[&<>'"]/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
  })[character] ?? character);
}

function recordText(record: Pick<TaskModel, 'get'>, field: string, fallback = '') {
  const value: unknown = record.get(field);
  return typeof value === 'string' ? value : fallback;
}

function taskContext(event: {
  batchCount?: number;
  startDate: Date;
  endDate: Date;
  allDay: boolean;
  assignedResources: string[];
  publicationLabel: string;
  locked?: boolean;
  pickup?: boolean;
  delivery?: boolean;
}, es: boolean) {
  const dateLocale = es ? 'es' : 'en';
  const start = event.startDate.toLocaleDateString(dateLocale, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const end = event.endDate.toLocaleDateString(dateLocale, {
    weekday: 'short', month: 'short', day: 'numeric',
  });
  const unassigned = es ? 'Sin asignar' : 'Unassigned';
  const resources = event.assignedResources.length
    ? event.assignedResources.join(', ') : unassigned;
  const batchUnit = es ? ['lote', 'lotes'] : ['batch', 'batches'];
  const unavailable = es ? 'Lotes sin especificar' : 'Batches unspecified';
  const batch = event.batchCount !== undefined
    ? `${event.batchCount} ${batchUnit[event.batchCount === 1 ? 0 : 1]}` : unavailable;
  const tracksCompletion = !event.pickup && !event.delivery;
  const complete = tracksCompletion && Boolean(event.locked);
  let percentDone: number | undefined;
  let completionLabel = es ? 'No aplica' : 'Not applicable';
  if (tracksCompletion) {
    percentDone = complete ? 100 : 0;
    completionLabel = es ? 'No completado' : 'Not complete';
    if (complete) completionLabel = es ? 'Completo' : 'Complete';
  }
  return {
    context: [start, batch, resources].join(' · '),
    dateLabel: start,
    peopleLabel: resources,
    batchLabel: batch,
    publicationLabel: event.publicationLabel || '—',
    completionLabel,
    scheduleLabel: start === end ? start : `${start} – ${end}`,
    progressLabel: percentDone === undefined ? '—' : `${percentDone}%`,
    percentDone,
  };
}

/** Customer/order workflow plan rendered through Bryntum Gantt's native tree APIs. */
export default function BryntumGanttTrialSurface({
  data, startDate, endDate, planStartDate, locale, canManage, pending, resetVersion,
  onAddWork, onEventSummary, onEdit, onDuplicate, onDelete = undefined,
  onViewExecutionSchedule, onCreate, onDateChange,
}: BryntumSchedulerProps) {
  const es = locale === 'es';
  const editable = canManage && !pending;
  const ganttRef = useRef<BryntumGantt>(null);
  const deleteViewState = useRef<{
    x: number; y: number; expanded: Map<string, boolean>; selectedIds: string[];
  } | null>(null);
  const dayWidth = 130;
  const tasks = useMemo(() => {
    const eventsByResource = new Map<string, typeof data.events>();
    data.assignments.forEach((assignment) => {
      const event = data.events.find((candidate) => candidate.id === assignment.eventId);
      if (!event) return;
      const resourceEvents = eventsByResource.get(assignment.resourceId) ?? [];
      resourceEvents.push(event);
      eventsByResource.set(assignment.resourceId, resourceEvents);
    });
    const resourcesByParent = new Map<string | undefined, typeof data.resources>();
    data.resources.forEach((resource) => {
      const children = resourcesByParent.get(resource.parentId) ?? [];
      children.push(resource);
      resourcesByParent.set(resource.parentId, children);
    });
    const createTask = (resource: typeof data.resources[number]): GanttTask => {
      const childResources = resourcesByParent.get(resource.id) ?? [];
      const childTasks = childResources.map(createTask);
      const eventTasks = (eventsByResource.get(resource.id) ?? []).toSorted((left, right) => (
        left.startDate.getTime() - right.startDate.getTime()
        || left.endDate.getTime() - right.endDate.getTime()
        || left.name.localeCompare(right.name)
      )).map((event) => {
        const details = taskContext(event, es);
        const workLabel = event.calendarTitle ?? event.name;
        const productLabel = event.name.startsWith(`${workLabel} · `)
          ? event.name.slice(workLabel.length + 3) : '';
        let statusClass: string = event.publicationState;
        if (event.pickup || event.delivery) statusClass = 'scheduled';
        if (details.percentDone === 100) statusClass = 'complete';
        return {
          // A live work item may legitimately be projected onto multiple
          // capability lanes. Bryntum's task store requires a unique id per
          // rendered record, while mutations must still use the source event.
          id: `${event.id}:${resource.id}`,
          sourceEventId: event.id,
          creationResourceId: resource.id,
          name: event.name,
          workLabel,
          productDateLabel: [productLabel, details.dateLabel].filter(Boolean).join(' · '),
          ...details,
          // Every work-order pill is a date-only commitment. The save callback
          // normalizes drops to facility-local midnight boundaries.
          manuallyScheduled: true,
          startDate: event.startDate,
          endDate: event.pickup ? event.startDate : event.endDate,
          milestone: Boolean(event.pickup),
          duration: event.pickup ? 0 : undefined,
          eventColor: event.eventColor,
          cls: event.pickup ? 'order-milestone' : `${workPillClass(event.workType)} status-${statusClass}`,
          readOnly: Boolean(event.locked) || !canManage,
          draggable: !event.locked && canManage,
          resizable: !event.locked && canManage,
        };
      });
      let context = 'Work without an order';
      if (resource.id.startsWith('customer:')) {
        context = `${childResources.length} ${childResources.length === 1 ? 'order' : 'orders'}`;
      } else if (resource.id.includes(':area:')) {
        context = '';
      } else if (resource.id.startsWith('order:')) {
        context = resource.context ?? `Pickup ${resource.pickupDate ?? 'to be scheduled'}`;
      }
      return {
        id: resource.id,
        name: resource.name,
        context,
        batchLabel: resource.batchLabel,
        progressLabel: resource.progressLabel,
        cls: workflowSummaryClass(resource.id),
        expanded: resource.expanded ?? true,
        children: [...childTasks, ...eventTasks, ...(data.milestones ?? [])
          .filter((milestone) => resource.id === `order:${milestone.orderId}`)
          .map((milestone) => ({
            id: milestone.id,
            name: milestone.name,
            workLabel: milestone.name,
            productDateLabel: milestone.date.toLocaleDateString(es ? 'es' : 'en'),
            milestone: true,
            manuallyScheduled: true,
            startDate: milestone.date,
            endDate: milestone.date,
            duration: 0,
            cls: 'order-milestone',
            readOnly: true,
            draggable: false,
            resizable: false,
          }))],
      };
    };
    return (resourcesByParent.get(undefined) ?? []).map(createTask);
  }, [data, canManage, es]);

  const tasksById = useMemo(() => {
    const index = new Map<string, GanttTask>();
    const visit = (task: GanttTask) => {
      index.set(task.id, task);
      task.children?.forEach(visit);
    };
    tasks.forEach(visit);
    return index;
  }, [tasks]);
  const dependencies = useMemo(() => {
    const projections = new Map<string, string[]>();
    tasksById.forEach((task) => {
      if (!task.sourceEventId) return;
      const eventProjections = projections.get(task.sourceEventId) ?? [];
      projections.set(task.sourceEventId, [...eventProjections, task.id]);
    });
    const projectedDependencies = data.dependencies.flatMap((dependency) => {
      const from = projections.get(dependency.from)?.[0];
      const to = projections.get(dependency.to)?.[0];
      return from && to ? [{ ...dependency, from, to }] : [];
    });
    (data.milestones ?? []).forEach((milestone) => {
      const orderWorkIds = new Set(data.assignments
        .filter((assignment) => assignment.resourceId.startsWith(`order:${milestone.orderId}:`))
        .map((assignment) => assignment.eventId)
        .filter((id) => !id.startsWith('pickup:')));
      const pickup = projections.get(`pickup:${milestone.orderId}`)?.[0];
      const projectedWork = [...orderWorkIds].flatMap((id) => projections.get(id)?.[0] ?? []);
      if (milestone.kind === 'order_received') {
        const firstTasks = projectedWork.filter((id) => !projectedDependencies.some(
          (edge) => edge.to === id,
        ));
        firstTasks.forEach((id) => projectedDependencies.push({
          id: `${milestone.id}:${id}`, from: milestone.id, to: id, type: 2,
        }));
      } else {
        // Keep receiving the order and completing production as immutable plan anchors.
        // Route the terminal work links through completion before the pickup marker.
        const lastTasks = projectedWork.filter((id) => !projectedDependencies.some((edge) => (
          edge.from === id && projectedWork.includes(edge.to)
        )));
        if (pickup) {
          for (let index = projectedDependencies.length - 1; index >= 0; index -= 1) {
            if (projectedDependencies[index]?.to === pickup) projectedDependencies.splice(index, 1);
          }
        }
        lastTasks.forEach((id) => projectedDependencies.push({
          id: `${id}:${milestone.id}`, from: id, to: milestone.id, type: 2,
        }));
        if (pickup) {
          projectedDependencies.push({
            id: `${milestone.id}:${pickup}`, from: milestone.id, to: pickup, type: 2,
          });
        }
      }
    });
    return projectedDependencies;
  }, [data.assignments, data.dependencies, data.milestones, tasksById]);
  const [project] = useState(() => new ProjectModel({
    taskStore: { syncDataOnLoad: true },
    dependencyStore: { syncDataOnLoad: true },
    tasksData: tasks,
    dependenciesData: dependencies,
  }));
  const appliedTasks = useRef(tasks);
  const appliedDependencies = useRef(dependencies);
  const appliedResetVersion = useRef(resetVersion);
  const reconciliation = useRef<Promise<void>>(Promise.resolve());
  const reconciliationVersion = useRef(0);

  useEffect(() => {
    const gantt = ganttRef.current?.instance;
    if (!gantt || pending) return undefined;
    const saved = deleteViewState.current ?? (() => {
      const expanded = new Map<string, boolean>();
      gantt.taskStore.allRecords.forEach((record) => {
        if (record.isParent) expanded.set(String(record.id), record.expanded);
      });
      return {
        x: gantt.timeAxisSubGrid.scrollable.x,
        y: gantt.scrollable.y,
        expanded,
        selectedIds: gantt.selectedRecords.map((record) => String(
          typeof record === 'object' ? record.id : record,
        )),
      };
    })();
    if (
      appliedTasks.current === tasks
      && appliedDependencies.current === dependencies
      && appliedResetVersion.current === resetVersion
      && !deleteViewState.current
    ) return undefined;
    appliedTasks.current = tasks;
    appliedDependencies.current = dependencies;
    appliedResetVersion.current = resetVersion;
    let disposed = false;
    const version = reconciliationVersion.current + 1;
    reconciliationVersion.current = version;
    const reconcile = async () => {
      await project.loadInlineData({
        tasksData: tasks,
        dependenciesData: dependencies,
      });
      await project.commitAsync();
      if (disposed || version !== reconciliationVersion.current || gantt.isDestroyed) return;
      await Promise.all([...saved.expanded].map(async ([id, expanded]) => {
        const record = gantt.taskStore.getById(id);
        if (record?.isParent && record.expanded !== expanded) {
          await gantt.taskStore.toggleCollapse(record, !expanded);
        }
      }));
      if (disposed || gantt.isDestroyed) return;
      const selectedIds = saved.selectedIds.filter((id) => gantt.taskStore.getById(id));
      if (selectedIds.length) gantt.selectRows(selectedIds);
      gantt.timeAxisSubGrid.scrollable.x = saved.x;
      gantt.scrollable.y = saved.y;
      deleteViewState.current = null;
    };
    // Bryntum calculations are asynchronous. Serialize complete snapshots so
    // a slower earlier response cannot overwrite a newer optimistic/server
    // reconciliation and leave tasks detached from their tree records.
    reconciliation.current = reconciliation.current.then(reconcile, reconcile)
      .catch((error: unknown) => logFailure('scheduler_restore_planner_view', error));
    return () => {
      disposed = true;
    };
  }, [tasks, dependencies, pending, resetVersion, project]);

  function deleteWork(id: string) {
    const gantt = ganttRef.current?.instance;
    if (gantt) {
      const expanded = new Map<string, boolean>();
      gantt.taskStore.allRecords.forEach((record) => {
        if (record.isParent) expanded.set(String(record.id), record.expanded);
      });
      deleteViewState.current = {
        x: gantt.timeAxisSubGrid.scrollable.x,
        y: gantt.scrollable.y,
        expanded,
        selectedIds: gantt.selectedRecords.map((record) => String(
          typeof record === 'object' ? record.id : record,
        )),
      };
    }
    onDelete?.(id);
  }

  function sourceEventId(taskRecord: Pick<TaskModel, 'id' | 'get'>) {
    return recordText(taskRecord, 'sourceEventId', String(taskRecord.id));
  }

  function persistMovedTask(taskRecord: TaskModel) {
    if (!(taskRecord.startDate instanceof Date) || !(taskRecord.endDate instanceof Date)) return;
    const id = sourceEventId(taskRecord);
    if (id.startsWith('customer:') || id.startsWith('order:') || id === 'unlinked-work') return;
    const start = new Date(taskRecord.startDate);
    const end = new Date(taskRecord.endDate);
    window.setTimeout(() => {
      onDateChange(id, start, end)
        .catch((error: unknown) => logFailure('scheduler_gantt_move', error));
    }, 0);
  }

  function focusTimeline() {
    const timeline = ganttRef.current?.instance.timeAxisSubGridElement;
    if (!timeline) return;
    timeline.setAttribute('tabindex', '0');
    timeline.focus({ preventScroll: true });
  }

  function scrollWeek(direction: number) {
    ganttRef.current?.instance.timeAxisSubGrid.scrollable
      .scrollBy(direction * dayWidth * 7, 0, { animate: false })
      .catch((error: unknown) => logFailure('scheduler_gantt_scroll_week', error));
  }

  function scrollTimelineWithArrow(event: KeyboardEvent<HTMLElement>) {
    const gantt = ganttRef.current?.instance;
    if (!gantt || event.target !== gantt.timeAxisSubGridElement) return;
    if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
    event.preventDefault();
    const distance = event.key === 'ArrowLeft' ? -dayWidth : dayWidth;
    gantt.timeAxisSubGrid.scrollable
      .scrollBy(distance, 0, { animate: false })
      .catch((error: unknown) => logFailure('scheduler_gantt_scroll_arrow', error));
  }

  return (
    <section
      className={styles.surface}
      aria-label={es ? 'Plan de producción' : 'Production plan'}
      aria-busy={pending}
      onKeyDownCapture={scrollTimelineWithArrow}
    >
      <p className={styles.note}>
        {es
          ? `Plan de producción por cliente, pedido y área funcional (${data.timezone}).`
          : `Production plan by customer, order, and functional area (${data.timezone}).`}
      </p>
      <div className={styles.actions}>
        <div role="group" aria-label={es ? 'Navegar por semanas' : 'Navigate weeks'}>
          <button type="button" onClick={() => scrollWeek(-1)}>
            {es ? '← Semana anterior' : '← Previous week'}
          </button>
          <button
            type="button"
            onClick={() => {
              ganttRef.current?.instance
                .scrollToDate(new Date(`${planStartDate}T00:00:00`), { block: 'start' })
                .catch((error: unknown) => logFailure('scheduler_gantt_scroll_start', error));
            }}
          >
            {es ? 'Inicio del plan' : 'Plan start'}
          </button>
          <button type="button" onClick={() => scrollWeek(1)}>
            {es ? 'Semana siguiente →' : 'Next week →'}
          </button>
        </div>
        {canManage ? (
          <button type="button" className={styles.addWork} disabled={pending} onClick={onAddWork}>
            {es ? 'Agregar trabajo' : 'Add work'}
          </button>
        ) : null}
      </div>
      <BryntumGantt
        ref={ganttRef}
        // Only a changed date horizon needs a new TimeAxis. Mutations update
        // the existing tree store so expansion, indentation and scroll survive.
        key={`${startDate}:${endDate}:daily-plan-v4`}
        ariaLabel={es ? 'Plan de producción' : 'Production plan'}
        height={780}
        startDate={`${startDate}T00:00:00`}
        endDate={`${endDate}T00:00:00`}
        project={project}
        // Keep the complete rolling horizon fixed while scrolling its viewport.
        fillTicks
        forceFit={false}
        infiniteScroll={false}
        autoAdjustTimeAxis={false}
        workingTime={{ fromDay: 1, toDay: 6 }}
        snapRelativeToEventStartDate
        // Bryntum's generic bounds include preparation and pickup; those are not
        // the production start and final batch consumption dates.
        projectLinesFeature={false}
        readOnly={!editable}
        barMargin={8}
        rowHeight={52}
        columns={[
          {
            type: 'name',
            text: es ? 'Cliente, pedido y trabajo' : 'Customer, order & work',
            width: 360,
            // This is a structural tree column, not a data-sort column. Sorting
            // it can reorder parent and child records and makes the customer →
            // order → stage hierarchy appear flat.
            sortable: false,
            cellCls: styles.orderIdentity,
            renderer: ({ record }: {
              record: Pick<TaskModel, 'id' | 'get'>;
            }) => {
              const name: unknown = record.get('name');
              if (!record.get('sourceEventId') && !record.get('milestone')) {
                return typeof name === 'string' ? name : '';
              }
              return {
                tag: 'div',
                className: styles.workIdentity,
                children: [
                  {
                    tag: 'span',
                    className: styles.workIdentityTitle,
                    text: recordText(record, 'workLabel', typeof name === 'string' ? name : ''),
                  },
                  {
                    tag: 'span',
                    className: styles.workIdentityDetail,
                    text: recordText(record, 'productDateLabel'),
                  },
                ],
              };
            },
          },
          {
            text: es ? 'Lotes' : 'Batches',
            field: 'batchLabel',
            width: 175,
            editor: false,
            renderer: ({ record }: {
              record: Pick<TaskModel, 'id' | 'get'>;
            }) => {
              const value: unknown = record.get('batchLabel');
              const batchLabel = typeof value === 'string' ? value : '';
              const recordId = String(record.id);
              if (!recordId.startsWith('order:') || record.get('sourceEventId') || !batchLabel) return batchLabel;
              const parenthesis = batchLabel.indexOf(' (');
              if (parenthesis === -1) return batchLabel;
              return {
                tag: 'div',
                className: styles.orderBatchRollup,
                children: [
                  { tag: 'span', text: batchLabel.slice(0, parenthesis) },
                  { tag: 'span', text: batchLabel.slice(parenthesis + 1) },
                ],
              };
            },
          },
          {
            text: es ? '% finalizado' : 'Completion %',
            field: 'progressLabel',
            width: 110,
            editor: false,
          },
          {
            text: es ? 'Equipo' : 'Crew', field: 'peopleLabel', width: 180, editor: false,
          },
        ]}
        viewPreset={{
          base: 'dayAndWeek',
          headers: [
            { unit: 'week', increment: 1, dateFormat: 'MMM D' },
            { unit: 'day', increment: 1, dateFormat: 'ddd, MMM D' },
          ],
          tickWidth: dayWidth,
          shiftUnit: 'week',
          shiftIncrement: 1,
          timeResolution: { unit: 'day', increment: 1 },
        }}
        taskRenderer={({ taskRecord }) => {
          if (taskRecord.get('milestone')) return '';
          if (!taskRecord.get('sourceEventId')) return '';
          const people = String(taskRecord.get('peopleLabel') ?? '');
          const batches = String(taskRecord.get('batchLabel') ?? '');
          return {
            tag: 'div',
            title: `${taskRecord.name} · ${batches} · ${people}`,
            style: {
              display: 'flex', flexDirection: 'column', overflow: 'hidden', width: '100%',
            },
            children: [
              {
                tag: 'span',
                className: 'work-pill-status-line',
                children: [{ tag: 'span', text: batches }],
              },
              { tag: 'span', className: 'work-pill-crew', text: people },
            ],
          };
        }}
        taskTooltipFeature={{
          template: ({ taskRecord }) => {
            if (!taskRecord.get('sourceEventId')) {
              return `<strong>${escapeHtml(taskRecord.name)}</strong><br>${escapeHtml(String(taskRecord.get('context') ?? ''))}`;
            }
            const rows = [
              [es ? 'Finalización' : 'Completion', taskRecord.get('completionLabel')],
              [es ? '% finalizado' : 'Completion %', taskRecord.get('progressLabel')],
              [es ? 'Horario' : 'Schedule', taskRecord.get('scheduleLabel')],
              [es ? 'Lotes' : 'Batches', taskRecord.get('batchLabel')],
              [es ? 'Equipo' : 'Crew', taskRecord.get('peopleLabel')],
            ].map(([label, value]) => (
              `<div><strong>${escapeHtml(String(label))}:</strong> ${escapeHtml(String(value ?? '—'))}</div>`
            )).join('');
            return `<strong>${escapeHtml(taskRecord.name)}</strong>${rows}`;
          },
        }}
        cellTooltipFeature={{
          tooltipRenderer: ({ record }) => {
            const value = String(record.get('context') || record.get('name') || '');
            return escapeHtml(String(value));
          },
        }}
        dependenciesFeature={{ disabled: false }}
        taskDragFeature={{ disabled: !editable }}
        taskResizeFeature={{ disabled: !editable }}
        taskEditFeature={false}
        taskMenuFeature={{
          processItems: ({
            taskRecord, items, event, column, targetElement,
          }) => {
            // ScheduleMenu belongs to Scheduler in Bryntum 7.3.7. Gantt routes
            // empty timeline cells through TaskMenu with the row's task record.
            if (column?.region === 'normal' && !targetElement.closest('.b-gantt-task-wrap')) {
              if (!editable) return false;
              const date = ganttRef.current?.instance.getDateFromDomEvent(event, 'floor');
              if (!date || !Number.isFinite(date.getTime())) return false;
              const clearedItems = Object.fromEntries(
                Object.keys(items).map((key) => [key, false]),
              );
              Object.assign(items, clearedItems, {
                addWork: {
                  text: es ? 'Crear orden de trabajo' : 'Create Work Order',
                  icon: 'b-fa b-fa-plus',
                  onItem: () => {
                    const taskId = String(taskRecord.id);
                    const rowResourceId = taskId.startsWith('customer:')
                      || taskId.startsWith('order:')
                      || taskId === 'unlinked-work'
                      ? taskId
                      : String(taskRecord.parent?.id ?? taskId);
                    const resourceId = String(taskRecord.get('creationResourceId') ?? rowResourceId);
                    const end = new Date(date);
                    end.setDate(end.getDate() + 1);
                    onCreate(date, end, resourceId);
                  },
                },
              });
              return undefined;
            }
            const id = sourceEventId(taskRecord);
            if (taskRecord.get('milestone')) return false;
            if (id.startsWith('pickup:') || id.startsWith('delivery:') || id.startsWith('customer:') || id.startsWith('order:') || id === 'unlinked-work') {
              return false;
            }
            Object.assign(items, {
              deleteTask: false,
              viewExecutionSchedule: {
                text: es ? 'Ver calendario de ejecución' : 'View execution schedule',
                icon: 'b-fa b-fa-calendar',
                weight: 90,
                onItem: () => onViewExecutionSchedule(id),
              },
            });
            if (editable && !taskRecord.readOnly) {
              Object.assign(items, {
                edit: {
                  text: es ? 'Editar' : 'Edit', icon: 'b-fa b-fa-pen', weight: 95, onItem: () => onEdit(id),
                },
                duplicate: {
                  text: es ? 'Duplicar en otro día' : 'Duplicate to another day', icon: 'b-fa b-fa-copy', weight: 100, onItem: () => onDuplicate(id),
                },
                ...(onDelete ? {
                  deleteWork: {
                    text: es ? 'Eliminar' : 'Delete',
                    icon: 'b-fa b-fa-trash',
                    cls: 'b-danger',
                    weight: 110,
                    onItem: () => deleteWork(id),
                  },
                } : {}),
              });
            }
            return undefined;
          },
        }}
        onTaskClick={({ taskRecord }) => {
          if (taskRecord.get('milestone')) return;
          const id = sourceEventId(taskRecord);
          if (!id.startsWith('customer:') && !id.startsWith('order:') && id !== 'unlinked-work') onEventSummary(id);
        }}
        onTaskDrop={({ taskRecords }) => taskRecords.forEach(persistMovedTask)}
        onTaskResizeEnd={({ taskRecord, changed }) => {
          if (changed) persistMovedTask(taskRecord);
        }}
        onScheduleClick={() => focusTimeline()}
      />
    </section>
  );
}
