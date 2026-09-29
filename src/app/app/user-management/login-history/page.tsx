import { redirect } from 'next/navigation';
import Link from 'next/link';
import { Suspense } from 'react';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { readResult } from '@/lib/data';
import { logFailure } from '@/lib/operation-error';
import { PageHeader } from '@/components/shell';
import LoginHistoryTable, { type LoginHistoryEntry } from '@/components/login-history-table';
import DirectoryToolbar from '@/components/directory-toolbar';
import {
  hasLoginHistoryCriteria, parseLoginHistoryQuery, selectLoginHistory,
  type LoginHistorySearchParams,
} from './directory-query';

const loginEventSchema = z.object({
  id: z.uuid(),
  user_id: z.uuid(),
  event_type: z.enum(['signed_in', 'signed_out']),
  ip_address: z.string().nullable(),
  user_agent: z.string().nullable(),
  occurred_at: z.iso.datetime({ offset: true }),
});
const loginUserSchema = z.object({ user_id: z.uuid(), display_name: z.string().min(1) });

function eventSource(userAgent: string | null, ipAddress: string | null, fallback: string) {
  const details = [userAgent, ipAddress].filter((value): value is string => Boolean(value));
  return details.length ? details.join(' · ') : fallback;
}

async function loadLoginHistory(
  db: Awaited<ReturnType<typeof requireAdminShell>>['db'],
  fallbackSource: string,
  fallbackUser: string,
): Promise<LoginHistoryEntry[]> {
  const [eventResult, userResult] = await Promise.all([
    db
      .from('login_events')
      .select('id,user_id,event_type,ip_address,user_agent,occurred_at')
      .order('occurred_at', { ascending: false })
      .limit(250),
    db.rpc('login_event_user_names'),
  ]);
  const events = readResult(eventResult, loginEventSchema.array(), 'login_history_events');
  const users = readResult(userResult, loginUserSchema.array(), 'login_history_users');
  const userNames = new Map(users.map((user) => [user.user_id, user.display_name]));
  return events.toSorted((left, right) => right.occurred_at.localeCompare(left.occurred_at))
    .map((event) => ({
      id: event.id,
      userId: event.user_id,
      userName: userNames.get(event.user_id) ?? fallbackUser,
      occurredAt: event.occurred_at,
      eventType: event.event_type,
      source: eventSource(event.user_agent, event.ip_address, fallbackSource),
    }));
}

export default async function LoginHistoryPage({ searchParams }: {
  searchParams?: Promise<LoginHistorySearchParams>;
} = {}) {
  const { db, profile } = await requireAdminShell();
  const allowed = await hasPermission(db, 'audit.read');
  if (!allowed) redirect('/app');
  const isSpanish = profile.preferred_locale === 'es';
  const locale = profile.preferred_locale;
  const query = parseLoginHistoryQuery(await searchParams ?? {});
  let entries: LoginHistoryEntry[] | null = null;
  try {
    entries = await loadLoginHistory(
      db,
      isSpanish ? 'Aplicación web' : 'Web application',
      isSpanish ? 'Usuario desconocido' : 'Unknown user',
    );
  } catch (error) {
    logFailure('login_history_page', error);
  }
  const userOptions = [...new Map((entries ?? []).map((entry) => [entry.userId, entry.userName]))]
    .map(([value, label]) => ({ value, label }))
    .sort((left, right) => left.label.localeCompare(right.label, locale, { sensitivity: 'base' })
      || left.value.localeCompare(right.value));
  const visibleEntries = entries ? selectLoginHistory(entries, query, locale) : [];
  const filters = [
    { key: 'user', label: isSpanish ? 'Usuario' : 'User', options: userOptions },
    {
      key: 'event',
      label: isSpanish ? 'Evento' : 'Event',
      options: [
        { value: 'signed_in', label: isSpanish ? 'Sesión iniciada' : 'Signed in' },
        { value: 'signed_out', label: isSpanish ? 'Sesión cerrada' : 'Signed out' },
      ],
    },
  ];
  const sortOptions = [
    { value: 'newest', label: isSpanish ? 'Más recientes' : 'Newest first' },
    { value: 'oldest', label: isSpanish ? 'Más antiguos' : 'Oldest first' },
    { value: 'user', label: isSpanish ? 'Usuario A–Z' : 'User A–Z' },
  ];
  return (
    <>
      <PageHeader
        eyebrow={isSpanish ? 'ADMINISTRACIÓN DE USUARIOS' : 'USER MANAGEMENT'}
        title={isSpanish ? 'Historial de inicio de sesión' : 'Login History'}
        description={isSpanish
          ? 'Revise la actividad de acceso más reciente de los usuarios de su organización.'
          : 'Review the newest account access activity for users in your organization.'}
      />
      <section className="panel">
        <h2>{isSpanish ? 'Actividad reciente' : 'Recent activity'}</h2>
        {entries ? (
          <>
            <Suspense fallback={null}>
              <DirectoryToolbar
                label={isSpanish ? 'Filtrar historial de acceso' : 'Filter login history'}
                resultCount={visibleEntries.length}
                filters={filters}
                sortOptions={sortOptions}
                dateRange={{
                  fromKey: 'from',
                  toKey: 'to',
                  fromLabel: isSpanish ? 'Desde' : 'From',
                  toLabel: isSpanish ? 'Hasta' : 'To',
                }}
                locale={locale}
                mobileFilters
              />
            </Suspense>
            {entries.length > 0 && visibleEntries.length === 0 ? (
              <div className="empty" role="status">
                <h3>{isSpanish ? 'No hay actividad que coincida' : 'No matching login activity'}</h3>
                <p>{isSpanish ? 'Pruebe otra búsqueda o borre los filtros.' : 'Try another search or clear the filters.'}</p>
                {hasLoginHistoryCriteria(query) && (
                  <Link href="/app/user-management/login-history">
                    {isSpanish ? 'Borrar todos los filtros' : 'Clear all filters'}
                  </Link>
                )}
              </div>
            ) : <LoginHistoryTable entries={visibleEntries} locale={locale} />}
          </>
        ) : (
          <div className="error-notice" role="alert">
            <h3>{isSpanish ? 'No se pudo cargar el historial' : 'Login history is unavailable'}</h3>
            <p>
              {isSpanish
                ? 'Inténtelo de nuevo. No se mostraron datos parciales.'
                : 'Try again. No partial or stale results were shown.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
