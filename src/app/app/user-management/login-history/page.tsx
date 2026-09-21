import { redirect } from 'next/navigation';
import { z } from 'zod';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { readResult } from '@/lib/data';
import { logFailure } from '@/lib/operation-error';
import { PageHeader } from '@/components/shell';
import LoginHistoryTable, { type LoginHistoryEntry } from '@/components/login-history-table';

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
      userName: userNames.get(event.user_id) ?? fallbackUser,
      occurredAt: event.occurred_at,
      eventType: event.event_type,
      source: eventSource(event.user_agent, event.ip_address, fallbackSource),
    }));
}

export default async function LoginHistoryPage() {
  const { db, profile } = await requireAdminShell();
  const allowed = await hasPermission(db, 'audit.read');
  if (!allowed) redirect('/app');
  const isSpanish = profile.preferred_locale === 'es';
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
          <LoginHistoryTable entries={entries} locale={profile.preferred_locale} />
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
