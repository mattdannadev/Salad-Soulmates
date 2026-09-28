'use client';

import Link from 'next/link';
import { useState } from 'react';
import {
  ArrowUpRight, CheckCircle2, FileWarning, LoaderCircle, LockKeyhole, Users,
} from 'lucide-react';
import { z } from 'zod';
import styles from './administration-copilot.module.css';

const setupRecordSchema = z.object({
  organizationName: z.string(),
  organizationStatus: z.enum(['active', 'suspended']),
  facilityName: z.string(),
  facilityTimezone: z.string(),
  activeUserCount: z.number().int().nonnegative(),
  activeAccessProfileCount: z.number().int().nonnegative(),
});
const errorRecordSchema = z.object({
  id: z.uuid(),
  operation: z.string(),
  errorCode: z.string(),
  severity: z.enum(['warning', 'error', 'critical']),
  safeMessage: z.string(),
  route: z.string().nullable(),
  occurredAt: z.iso.datetime({ offset: true }),
});
const loginRecordSchema = z.object({
  id: z.uuid(),
  eventType: z.enum(['signed_in', 'signed_out']),
  occurredAt: z.iso.datetime({ offset: true }),
});
const successResponseSchema = z.discriminatedUnion('toolId', [
  z.object({
    ok: z.literal(true),
    toolId: z.literal('tenant_setup_status'),
    classification: z.literal('read'),
    source: z.string().startsWith('/app/'),
    count: z.number().int().nonnegative(),
    records: z.array(setupRecordSchema).max(1),
  }),
  z.object({
    ok: z.literal(true),
    toolId: z.literal('recent_errors'),
    classification: z.literal('read'),
    source: z.null(),
    count: z.number().int().nonnegative(),
    records: z.array(errorRecordSchema).max(25),
  }),
  z.object({
    ok: z.literal(true),
    toolId: z.literal('login_events'),
    classification: z.literal('read'),
    source: z.string().startsWith('/app/'),
    count: z.number().int().nonnegative(),
    records: z.array(loginRecordSchema).max(25),
  }),
]);
const failureResponseSchema = z.object({
  ok: z.literal(false),
  code: z.enum(['invalid', 'unsupported', 'unauthenticated', 'denied', 'unavailable']),
  error: z.string(),
});
const diagnosticResponseSchema = z.union([successResponseSchema, failureResponseSchema]);
const severityFilterSchema = z.enum(['all', 'warning', 'error', 'critical']);
const eventTypeFilterSchema = z.enum(['all', 'signed_in', 'signed_out']);

type DiagnosticResult = z.infer<typeof successResponseSchema>;
type DiagnosticRequest = | { intent: 'tenant_setup_status' }
  | { intent: 'recent_errors'; limit: number; severity?: 'warning' | 'error' | 'critical' }
  | { intent: 'login_events'; limit: number; eventType?: 'signed_in' | 'signed_out' };

const DATE_FORMAT = new Intl.DateTimeFormat(undefined, {
  dateStyle: 'medium',
  timeStyle: 'short',
});

function formatDate(value: string) {
  return DATE_FORMAT.format(new Date(value));
}

function safeApplicationPath(value: string | null) {
  return value && /^\/app(?:\/|$)/.test(value) ? value : null;
}

async function requestDiagnostic(input: DiagnosticRequest) {
  const response = await fetch('/api/administration-diagnostics', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  });
  if (response.redirected) {
    throw new Error('Your session has ended. Sign in again to continue.');
  }
  const payload = diagnosticResponseSchema.parse(await response.json());
  if (!response.ok || !payload.ok) {
    throw new Error(payload.ok ? 'The diagnostic could not be completed.' : payload.error);
  }
  return payload;
}

function ResultDetail({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <dt>{label}</dt>
      <dd>{value}</dd>
    </div>
  );
}

function DiagnosticResults({ result }: { result: DiagnosticResult }) {
  return (
    <section className={styles.results} aria-live="polite" aria-label="Diagnostic results">
      <div className={styles.resultsHeader}>
        <span className={styles.confirmIcon}><CheckCircle2 size={20} aria-hidden="true" /></span>
        <div>
          <span>READ-ONLY CHECK COMPLETE · NO DATA WAS CHANGED</span>
          <h2>{result.count === 1 ? '1 matching record' : `${result.count} matching records`}</h2>
        </div>
        {result.source ? (
          <Link href={result.source}>
            Open source screen
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        ) : null}
      </div>
      {result.records.length === 0 && (
        <div className={styles.empty}>
          <strong>No matching records</strong>
          <p>Try another check or open the source screen to review the full permitted view.</p>
        </div>
      )}
      {result.toolId === 'tenant_setup_status' && result.records.map((record) => (
        <dl
          className={styles.setupResult}
          key={`${record.organizationName}-${record.facilityName}`}
        >
          <ResultDetail
            label="Organization"
            value={`${record.organizationName} (${record.organizationStatus})`}
          />
          <ResultDetail label="Active facility" value={record.facilityName} />
          <ResultDetail label="Facility timezone" value={record.facilityTimezone} />
          <ResultDetail label="Active users" value={String(record.activeUserCount)} />
          <ResultDetail
            label="Active access profiles"
            value={String(record.activeAccessProfileCount)}
          />
        </dl>
      ))}
      {result.toolId === 'recent_errors' && result.records.map((record) => (
        <article className={styles.record} key={record.id}>
          <div>
            <strong>{record.safeMessage}</strong>
            <span className={styles.badge}>{record.severity}</span>
          </div>
          <p>
            {record.operation}
            {' '}
            ·
            {' '}
            {record.errorCode}
          </p>
          <small>
            {formatDate(record.occurredAt)}
          </small>
          {safeApplicationPath(record.route) ? (
            <Link href={safeApplicationPath(record.route) ?? '/app'}>
              Open affected screen
              <ArrowUpRight size={15} aria-hidden="true" />
            </Link>
          ) : null}
        </article>
      ))}
      {result.toolId === 'login_events' && result.records.map((record) => (
        <article className={styles.record} key={record.id}>
          <div><strong>{record.eventType === 'signed_in' ? 'Signed in' : 'Signed out'}</strong></div>
          <small>{formatDate(record.occurredAt)}</small>
        </article>
      ))}
    </section>
  );
}

export default function AdministrationCopilot() {
  const [result, setResult] = useState<DiagnosticResult>();
  const [error, setError] = useState('');
  const [busyIntent, setBusyIntent] = useState<DiagnosticRequest['intent']>();
  const [severity, setSeverity] = useState<z.infer<typeof severityFilterSchema>>('all');
  const [eventType, setEventType] = useState<z.infer<typeof eventTypeFilterSchema>>('all');

  const run = async (request: DiagnosticRequest) => {
    if (busyIntent) return;
    setBusyIntent(request.intent);
    setError('');
    try {
      setResult(await requestDiagnostic(request));
    } catch (cause) {
      setResult(undefined);
      const message = cause instanceof Error ? cause.message : 'The diagnostic could not be completed.';
      setError(`${message} No data was changed.`);
    } finally {
      setBusyIntent(undefined);
    }
  };
  const start = (request: DiagnosticRequest) => {
    run(request).catch(() => {
      setError('The diagnostic could not be completed. No data was changed.');
    });
  };

  return (
    <div className={styles.workspace}>
      <aside className={styles.safety}>
        <span className={styles.safetyIcon}><LockKeyhole size={20} aria-hidden="true" /></span>
        <div>
          <strong>Safe, read-only diagnostics</strong>
          <p>
            This copilot uses fixed checks only. It cannot edit setup, run arbitrary queries,
            or call an AI provider.
          </p>
        </div>
        <span className={styles.readOnlyBadge}>READ ONLY</span>
      </aside>

      <section className={styles.intentGrid} aria-label="Administration diagnostic choices">
        <article className={styles.intentCard}>
          <CheckCircle2 size={24} aria-hidden="true" />
          <h2>Tenant setup</h2>
          <p>Review the active organization, facility, timezone, users, and access profiles.</p>
          <button
            type="button"
            disabled={Boolean(busyIntent)}
            onClick={() => {
              start({ intent: 'tenant_setup_status' });
            }}
          >
            {busyIntent === 'tenant_setup_status' ? 'Checking…' : 'Check tenant setup'}
          </button>
          <Link href="/app/user-management/users">
            Open users
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </article>

        <form
          className={styles.intentCard}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const filter = severity === 'all' ? {} : {
              severity,
            };
            start({ intent: 'recent_errors', limit: 10, ...filter });
          }}
        >
          <FileWarning size={24} aria-hidden="true" />
          <h2>Recent safe errors</h2>
          <p>Review customer-safe error summaries. Private technical details are never returned.</p>
          <label htmlFor="diagnostic-severity">Severity</label>
          <select
            id="diagnostic-severity"
            value={severity}
            onChange={(changeEvent) => {
              setSeverity(severityFilterSchema.parse(changeEvent.target.value));
            }}
          >
            <option value="all">All severities</option>
            <option value="warning">Warning</option>
            <option value="error">Error</option>
            <option value="critical">Critical</option>
          </select>
          <button type="submit" disabled={Boolean(busyIntent)}>
            {busyIntent === 'recent_errors' ? 'Loading…' : 'Review recent errors'}
          </button>
          <Link href="/app/user-management/login-history">
            Open audit history
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </form>

        <form
          className={styles.intentCard}
          onSubmit={(submitEvent) => {
            submitEvent.preventDefault();
            const filter = eventType === 'all' ? {} : {
              eventType,
            };
            start({ intent: 'login_events', limit: 10, ...filter });
          }}
        >
          <Users size={24} aria-hidden="true" />
          <h2>Login activity</h2>
          <p>Check recent sign-in and sign-out events for this organization.</p>
          <label htmlFor="diagnostic-event">Event</label>
          <select
            id="diagnostic-event"
            value={eventType}
            onChange={(changeEvent) => {
              setEventType(eventTypeFilterSchema.parse(changeEvent.target.value));
            }}
          >
            <option value="all">All events</option>
            <option value="signed_in">Signed in</option>
            <option value="signed_out">Signed out</option>
          </select>
          <button type="submit" disabled={Boolean(busyIntent)}>
            {busyIntent === 'login_events' ? 'Loading…' : 'Review login activity'}
          </button>
          <Link href="/app/user-management/login-history">
            Open login history
            <ArrowUpRight size={15} aria-hidden="true" />
          </Link>
        </form>
      </section>

      {error && <div className={styles.error} role="alert">{error}</div>}
      {busyIntent ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <LoaderCircle className={styles.spinner} size={20} aria-hidden="true" />
          <span>
            <strong>Running a read-only check…</strong>
            {' '}
            Nothing is being changed.
          </span>
        </div>
      ) : null}
      {result && <DiagnosticResults result={result} />}

      <nav className={styles.shortcuts} aria-label="Administration setup shortcuts">
        <div>
          <strong>Continue in administration</strong>
          <span>
            These links open source screens. Changes occur only if you explicitly save there.
          </span>
        </div>
        <Link href="/app/settings">Settings and picklists</Link>
        <Link href="/app/user-management/profiles">Manage access profiles</Link>
        <Link href="/app/user-management/users">Manage users</Link>
      </nav>
    </div>
  );
}
