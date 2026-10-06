'use client';

import type { SchedulerPresentationData } from './scheduler-presentation';
import ScheduleBoard from './schedule-board';

export interface BryntumSchedulerProps {
  data: SchedulerPresentationData;
  startDate: string;
  endDate: string;
  /** Actual start of the production plan in the displayed planning week. */
  planStartDate: string;
  locale: 'en' | 'es';
  canManage: boolean;
  pending: boolean;
  resetVersion: number;
  focusedWorkId?: string;
  onAddWork: () => void;
  onEventSummary: (id: string) => void;
  onEdit: (id: string) => void;
  onDuplicate: (id: string) => void;
  onDelete?: (id: string) => void;
  onViewExecutionSchedule: (id: string) => void;
  onCreate: (startDate: Date, endDate: Date, resourceId: string) => void;
  onDateChange: (id: string, startDate: Date, endDate: Date) => Promise<void>;
}

export default function BryntumScheduler({
  onDelete = undefined, ...props
}: BryntumSchedulerProps) {
  return <ScheduleBoard {...props} onDelete={onDelete} />;
}
