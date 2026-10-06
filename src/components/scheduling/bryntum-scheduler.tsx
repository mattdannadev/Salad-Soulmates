'use client';

import dynamic from 'next/dynamic';
import { Component } from 'react';
import type { ReactNode } from 'react';
import type { SchedulerPresentationData } from './scheduler-presentation';

// The trial bundle touches browser globals. Keep its runtime and CSS behind this
// client-only boundary; never import the vendor runtime in a server component.
const TrialSurface = dynamic(() => import('./bryntum-trial-surface'), {
  ssr: false,
  loading: () => <p role="status">Loading schedule…</p>,
});

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

interface TrialBoundaryProps {
  children: ReactNode;
  locale: 'en' | 'es';
}

class TrialBoundary extends Component<TrialBoundaryProps, {
  failed: boolean;
}> {
  constructor(props: TrialBoundaryProps) {
    super(props);
    this.state = { failed: false };
  }

  static getDerivedStateFromError() {
    return { failed: true };
  }

  render() {
    const { children, locale } = this.props;
    const { failed } = this.state;
    if (failed) {
      return (
        <p role="alert">
          {locale === 'es'
            ? 'No se pudo cargar el calendario. Vuelva a cargar la página para continuar programando.'
            : 'The calendar could not load. Reload the page to continue scheduling.'}
        </p>
      );
    }
    return children;
  }
}

export default function BryntumScheduler({
  onDelete = undefined, ...props
}: BryntumSchedulerProps) {
  const { locale } = props;
  return (
    <TrialBoundary locale={locale}>
      <TrialSurface {...props} onDelete={onDelete} />
    </TrialBoundary>
  );
}
