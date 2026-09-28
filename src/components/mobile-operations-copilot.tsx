import Link from 'next/link';
import {
  ArrowLeft, CalendarDays, CheckCircle2, ClipboardList, PackageCheck, ShieldCheck,
} from 'lucide-react';
import { formatDate, formatNumber } from '@/domain/format';
import type { MobileOperationsCopilotResult } from '@/services/mobile-operations-copilot';
import styles from './mobile-operations-copilot.module.css';

export default function MobileOperationsCopilot({
  result,
  fallbackRole,
}: {
  result: MobileOperationsCopilotResult;
  fallbackRole: 'worker' | 'receiver';
}) {
  const locale = result.ok ? result.locale : 'en';
  const es = locale === 'es';
  const home = fallbackRole === 'worker' ? '/worker' : '/receiving';

  if (!result.ok) {
    return (
      <main className={styles.page}>
        <section className={styles.errorCard}>
          <ShieldCheck aria-hidden="true" />
          <p className={styles.eyebrow}>{es ? 'ACCESO PROTEGIDO' : 'PROTECTED ACCESS'}</p>
          <h1>{es ? 'Copiloto móvil' : 'Mobile Copilot'}</h1>
          <p role="alert">{result.error}</p>
          <Link className={styles.primaryLink} href={home}>
            <ArrowLeft size={18} aria-hidden="true" />
            {es ? 'Volver al espacio de trabajo' : 'Back to workspace'}
          </Link>
        </section>
      </main>
    );
  }

  const worker = result.kind === 'preparations';
  let title: string;
  let description: string;
  let sectionTitle: string;
  let emptyTitle: string;
  let firstPrompt: string;
  let secondPrompt: string;
  if (worker) {
    title = es ? '¿Qué preparo después?' : 'What should I prepare next?';
    description = es
      ? 'Preparaciones incompletas de tu instalación, en el orden del plan.'
      : 'Incomplete preparations for your facility, ordered by the production plan.';
    sectionTitle = es ? 'Preparaciones incompletas' : 'Incomplete preparations';
    emptyTitle = es ? 'No hay preparaciones pendientes' : 'No preparations are pending';
    firstPrompt = es
      ? 'Mostrar todos los ingredientes del siguiente lote'
      : 'Show every ingredient in the next batch';
    secondPrompt = es
      ? 'Continuar una preparación en proceso'
      : 'Continue a preparation already in progress';
  } else {
    title = es ? '¿Qué entregas están pendientes?' : 'Which deliveries are pending?';
    description = es
      ? 'Un resumen seguro de los pedidos abiertos que todavía tienen cantidades por recibir.'
      : 'A receipt-safe summary of open purchase orders that still have quantities due.';
    sectionTitle = es ? 'Entregas abiertas' : 'Open deliveries';
    emptyTitle = es ? 'No hay entregas pendientes' : 'No deliveries are pending';
    firstPrompt = es
      ? 'Abrir la entrega que vence primero'
      : 'Open the delivery due first';
    secondPrompt = es
      ? 'Revisar cantidades pendientes por artículo'
      : 'Review outstanding quantities by item';
  }
  return (
    <main className={styles.page} lang={locale}>
      <header className={styles.hero}>
        <div className={styles.heroTop}>
          <Link className={styles.backLink} href={home}>
            <ArrowLeft size={18} aria-hidden="true" />
            {es ? 'Espacio de trabajo' : 'Workspace'}
          </Link>
          <span className={styles.safeBadge}>
            <ShieldCheck size={17} aria-hidden="true" />
            {es ? 'Solo lectura' : 'Read only'}
          </span>
        </div>
        <p className={styles.eyebrow}>{es ? 'AYUDA PARA EL TURNO' : 'SHIFT ASSISTANT'}</p>
        <h1>{title}</h1>
        <p className={styles.lede}>{description}</p>
        <p className={styles.confirmation} role="status">
          <CheckCircle2 size={18} aria-hidden="true" />
          {es
            ? 'Confirmado: estos datos respetan tu organización, instalación y permisos.'
            : 'Confirmed: these results respect your organization, facility, and permissions.'}
        </p>
      </header>

      <section className={styles.results} aria-live="polite">
        <div className={styles.sectionHeading}>
          <div>
            <p className={styles.eyebrow}>{es ? 'AHORA' : 'RIGHT NOW'}</p>
            <h2>{sectionTitle}</h2>
          </div>
          <span className={styles.count}>{result.count}</span>
        </div>

        {result.records.length === 0 && (
          <div className={styles.empty}>
            <CheckCircle2 aria-hidden="true" />
            <h3>{emptyTitle}</h3>
            <p>{es ? 'Tu lista está al día.' : 'Your list is up to date.'}</p>
          </div>
        )}

        <div className={styles.cardList}>
          {worker && result.records.map((record) => (
            <article className={styles.card} key={record.id}>
              <div className={styles.cardIcon}><ClipboardList aria-hidden="true" /></div>
              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <div>
                    <p className={styles.kicker}>{`${es ? 'Lote' : 'Lot'} ${record.productionLotCode}`}</p>
                    <h3>{record.productName}</h3>
                  </div>
                  <span className={styles.status}>{record.status}</span>
                </div>
                <p className={styles.meta}>
                  <CalendarDays size={16} aria-hidden="true" />
                  {formatDate(record.assignedOn)}
                </p>
                <div className={styles.progressText}>
                  <span>{es ? 'Ingredientes listos' : 'Ingredients complete'}</span>
                  <strong>{`${record.completedIngredients} / ${record.totalIngredients}`}</strong>
                </div>
                <progress
                  max={Math.max(record.totalIngredients, 1)}
                  value={record.completedIngredients}
                />
                <Link className={styles.primaryLink} href={record.url}>
                  {es ? 'Abrir preparación' : 'Open preparation'}
                </Link>
              </div>
            </article>
          ))}

          {!worker && result.records.map((record) => (
            <article className={styles.card} key={record.id}>
              <div className={styles.cardIcon}><PackageCheck aria-hidden="true" /></div>
              <div className={styles.cardBody}>
                <div className={styles.cardTop}>
                  <div>
                    <p className={styles.kicker}>{record.reference}</p>
                    <h3>{record.supplierName}</h3>
                  </div>
                  <span className={styles.status}>{formatDate(record.expectedOn)}</span>
                </div>
                <ul className={styles.lineList}>
                  {record.lines.map((line) => (
                    <li key={line.id}>
                      <span>{line.ingredientName}</span>
                      <strong>{`${formatNumber(line.outstanding)} ${line.uom}`}</strong>
                    </li>
                  ))}
                </ul>
                <Link className={styles.primaryLink} href={record.url}>
                  {es ? 'Abrir recepción' : 'Open receiving'}
                </Link>
              </div>
            </article>
          ))}
        </div>
      </section>

      <aside className={styles.followUp}>
        <p className={styles.eyebrow}>{es ? 'SIGUIENTES PREGUNTAS' : 'FOLLOW-UP PROMPTS'}</p>
        <h2>{es ? 'También puedes revisar' : 'You can also review'}</h2>
        <div className={styles.promptList}>
          <Link href={home}>{firstPrompt}</Link>
          <Link href={home}>{secondPrompt}</Link>
        </div>
      </aside>
    </main>
  );
}
