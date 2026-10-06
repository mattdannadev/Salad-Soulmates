'use client';

import dynamic from 'next/dynamic';
import { Component } from 'react';
import type { ReactNode } from 'react';
import type { BryntumSchedulerProps } from './bryntum-scheduler';

const GanttSurface = dynamic(() => import('./bryntum-gantt-trial-surface'), {
  ssr: false,
  loading: () => <p role="status">Loading production plan…</p>,
});

class GanttBoundary extends Component<{ children: ReactNode; locale: 'en' | 'es' }, { failed: boolean }> {
  constructor(props: { children: ReactNode; locale: 'en' | 'es' }) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const { failed } = this.state;
    const { children, locale } = this.props;
    if (failed) {
      return (
        <p role="alert">
          {locale === 'es'
            ? 'No se pudo cargar el plan de producción. Vuelva a cargar la página para continuar.'
            : 'The production plan could not load. Reload the page to continue.'}
        </p>
      );
    }
    return children;
  }
}

/** Native Bryntum Gantt planning surface; Calendar remains the execution surface. */
export default function BryntumGantt(props: BryntumSchedulerProps) {
  const { locale } = props;
  return (
    <GanttBoundary locale={locale}>
      <GanttSurface {...props} />
    </GanttBoundary>
  );
}
