'use client';

import type { BryntumSchedulerProps } from './bryntum-scheduler';
import ScheduleBoard from './schedule-board';

/** Native Bryntum Gantt planning surface; Calendar remains the execution surface. */
export default function BryntumGantt(props: BryntumSchedulerProps) {
  return <ScheduleBoard {...props} />;
}
