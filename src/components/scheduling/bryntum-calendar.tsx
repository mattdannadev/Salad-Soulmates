'use client';

import type { BryntumSchedulerProps } from './bryntum-scheduler';
import ScheduleBoard from './schedule-board';

export default function BryntumCalendar(props: BryntumSchedulerProps) {
  return <ScheduleBoard {...props} />;
}
