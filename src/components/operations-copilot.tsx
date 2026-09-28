'use client';

import Link from 'next/link';
import { FormEvent, useState } from 'react';
import {
  ArrowRight, BookOpen, CheckCircle2, ClipboardList, LoaderCircle,
  Search, ShieldCheck,
} from 'lucide-react';
import { z } from 'zod';
import styles from './operations-copilot.module.css';

const recipeSchema = z.object({
  id: z.uuid(),
  name: z.string(),
  active_version_id: z.uuid().nullable(),
  url: z.string().startsWith('/app/'),
});
const orderSchema = z.object({
  id: z.uuid(),
  customer_name: z.string(),
  reference: z.string(),
  needed_on: z.iso.date(),
  url: z.string().startsWith('/app/'),
});
const successSchema = z.discriminatedUnion('kind', [
  z.object({
    ok: z.literal(true), kind: z.literal('recipes'), records: z.array(recipeSchema), source: z.string(), count: z.number(),
  }),
  z.object({
    ok: z.literal(true), kind: z.literal('orders'), records: z.array(orderSchema), source: z.string(), count: z.number(),
  }),
]);
const responseSchema = z.union([
  successSchema,
  z.object({ ok: z.literal(false), code: z.string(), error: z.string() }),
]);

type Kind = 'recipes' | 'orders';
type Result = z.infer<typeof successSchema>;

const choices = [
  {
    kind: 'recipes' as const, label: 'Recipes', detail: 'Names and active-version status', icon: BookOpen,
  },
  {
    kind: 'orders' as const, label: 'Orders', detail: 'Customers, references, and need dates', icon: ClipboardList,
  },
];

const dateFormat = new Intl.DateTimeFormat(undefined, { dateStyle: 'medium' });

function choiceFor(kind: Kind) {
  const choice = choices.find((candidate) => candidate.kind === kind);
  if (!choice) throw new Error('Unsupported Operations Copilot check.');
  return choice;
}

async function query(kind: Kind, search: string): Promise<Result> {
  const response = await fetch('/api/operations-copilot', {
    method: 'POST',
    cache: 'no-store',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ kind, search: search.trim() || undefined, limit: 12 }),
  });
  const parsed = responseSchema.parse(await response.json());
  if (!response.ok || !parsed.ok) {
    throw new Error(parsed.ok ? 'The read-only check could not be completed.' : parsed.error);
  }
  return parsed;
}

function ResultList({ result }: { result: Result }) {
  if (result.records.length === 0) {
    return (
      <div className={styles.empty}>
        <Search size={24} aria-hidden />
        <strong>No matching records</strong>
        <p>Try a broader search, or open the source screen to browse all permitted records.</p>
      </div>
    );
  }
  return (
    <div className={styles.resultGrid}>
      {result.kind === 'recipes' && result.records.map((record) => (
        <article className={styles.resultCard} key={record.id}>
          <span className={styles.resultIcon}><BookOpen size={18} aria-hidden /></span>
          <div>
            <h3>{record.name}</h3>
            <p>{record.active_version_id ? 'Active version available' : 'No active version'}</p>
          </div>
          <Link href={record.url} aria-label={`Open recipe ${record.name}`}>
            Open
            {' '}
            <ArrowRight size={15} aria-hidden />
          </Link>
        </article>
      ))}
      {result.kind === 'orders' && result.records.map((record) => (
        <article className={styles.resultCard} key={record.id}>
          <span className={styles.resultIcon}><ClipboardList size={18} aria-hidden /></span>
          <div>
            <h3>{record.customer_name}</h3>
            <p>
              {record.reference}
              {' '}
              · Needed
              {' '}
              {dateFormat.format(new Date(`${record.needed_on}T00:00:00`))}
            </p>
          </div>
          <Link href={record.url} aria-label={`Open order ${record.reference}`}>
            Open
            {' '}
            <ArrowRight size={15} aria-hidden />
          </Link>
        </article>
      ))}
    </div>
  );
}

export default function OperationsCopilot() {
  const [kind, setKind] = useState<Kind>('recipes');
  const [search, setSearch] = useState('');
  const [result, setResult] = useState<Result>();
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  async function run(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (busy) return;
    setBusy(true);
    setError('');
    setResult(undefined);
    try {
      setResult(await query(kind, search));
    } catch (cause) {
      const message = cause instanceof Error
        ? cause.message : 'The read-only check could not be completed.';
      setError(`${message} No data was changed.`);
    } finally {
      setBusy(false);
    }
  }

  const selected = choiceFor(kind);
  return (
    <div className={styles.workspace}>
      <aside className={styles.safety}>
        <span><ShieldCheck size={21} aria-hidden /></span>
        <div>
          <strong>Safe by design</strong>
          <p>
            Operations Copilot runs fixed, tenant-scoped read-only checks. It cannot edit records,
            execute free-form queries, or send data to an AI provider.
          </p>
        </div>
        <span className={styles.readOnly}>READ ONLY</span>
      </aside>

      <form
        className={styles.queryPanel}
        onSubmit={(event) => {
          run(event).catch(() => undefined);
        }}
      >
        <fieldset disabled={busy}>
          <legend>What would you like to check?</legend>
          <div className={styles.choiceGrid}>
            {choices.map((choice) => {
              const Icon = choice.icon;
              return (
                <label
                  className={choice.kind === kind ? styles.selectedChoice : styles.choice}
                  key={choice.kind}
                >
                  <input
                    type="radio"
                    name="kind"
                    value={choice.kind}
                    checked={choice.kind === kind}
                    onChange={() => setKind(choice.kind)}
                  />
                  <span className={styles.choiceIcon}><Icon size={20} aria-hidden /></span>
                  <span>
                    <strong>{choice.label}</strong>
                    <small>{choice.detail}</small>
                  </span>
                  <span className={styles.radioMark} aria-hidden />
                </label>
              );
            })}
          </div>
        </fieldset>
        <div className={styles.searchRow}>
          <label>
            Search
            {' '}
            {selected.label.toLocaleLowerCase()}
            <span className={styles.searchInput}>
              <Search size={18} aria-hidden />
              <input
                value={search}
                maxLength={120}
                onChange={(event) => setSearch(event.target.value)}
                placeholder={kind === 'orders'
                  ? 'Customer name (optional)'
                  : `${selected.label.slice(0, -1)} name (optional)`}
                disabled={busy}
              />
            </span>
          </label>
          <button type="submit" disabled={busy}>
            {busy
              ? <LoaderCircle className={styles.spinner} size={18} aria-hidden />
              : <Search size={18} aria-hidden />}
            {busy ? 'Running read-only check…' : `Find ${selected.label.toLocaleLowerCase()}`}
          </button>
        </div>
        <small className={styles.helper}>
          Up to 12 permitted records are returned. No data will be changed.
        </small>
      </form>

      {busy ? (
        <div className={styles.loading} role="status" aria-live="polite">
          <LoaderCircle className={styles.spinner} size={21} aria-hidden />
          <span>
            <strong>
              Checking
              {selected.label.toLocaleLowerCase()}
              …
            </strong>
            {' '}
            This is read-only; no data is being changed.
          </span>
        </div>
      ) : null}
      {error ? (
        <div className={styles.error} role="alert">
          <strong>Check not completed</strong>
          <span>{error}</span>
        </div>
      ) : null}
      {result ? (
        <section className={styles.results} aria-live="polite" aria-labelledby="operations-results-heading">
          <header className={styles.resultsHeader}>
            <span className={styles.confirmIcon}><CheckCircle2 size={20} aria-hidden /></span>
            <div>
              <p>READ-ONLY CHECK COMPLETE · NO DATA WAS CHANGED</p>
              <h2 id="operations-results-heading">
                {result.count === 1 ? '1 matching record' : `${result.count} matching records`}
              </h2>
            </div>
            <Link className="button secondary" href={result.source}>
              Open full
              {' '}
              {result.kind}
              {' '}
              screen
              {' '}
              <ArrowRight size={16} aria-hidden />
            </Link>
          </header>
          <ResultList result={result} />
          <footer className={styles.followUp}>
            <div>
              <strong>Need a different view?</strong>
              <span>Adjust the search above or check another operational area.</span>
            </div>
            <button
              type="button"
              className="secondary"
              onClick={() => {
                setSearch('');
                setResult(undefined);
              }}
            >
              Start another check
            </button>
          </footer>
        </section>
      ) : null}
    </div>
  );
}
