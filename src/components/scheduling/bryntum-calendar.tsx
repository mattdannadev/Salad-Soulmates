'use client';

import dynamic from 'next/dynamic';
import type { BryntumSchedulerProps } from './bryntum-scheduler';

// Calendar accesses browser globals during module initialization, so keep it
// client-only just like the Scheduler board.
const TrialSurface = dynamic(() => import('./bryntum-calendar-trial-surface'), {
  ssr: false,
  loading: () => <p role="status">Loading day calendar…</p>,
});

export default function BryntumCalendar(props: BryntumSchedulerProps) {
  return <TrialSurface {...props} />;
}
