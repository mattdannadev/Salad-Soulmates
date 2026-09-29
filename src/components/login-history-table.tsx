import { formatDate } from '@/domain/format';
import ListGrid from '@/components/list-grid';

export interface LoginHistoryEntry {
  id: string;
  userId: string;
  userName: string;
  occurredAt: string;
  eventType: 'signed_in' | 'signed_out';
  source: string;
}

function outcomeLabel(eventType: LoginHistoryEntry['eventType'], isSpanish: boolean) {
  if (eventType === 'signed_in') return isSpanish ? 'Sesión iniciada' : 'Signed in';
  return isSpanish ? 'Sesión cerrada' : 'Signed out';
}

export default function LoginHistoryTable({
  entries,
  locale,
}: {
  entries: LoginHistoryEntry[];
  locale: 'en' | 'es';
}) {
  const isSpanish = locale === 'es';
  if (!entries.length) {
    return (
      <div className="empty">
        <h3>{isSpanish ? 'Aún no hay actividad de acceso' : 'No login activity yet'}</h3>
        <p>
          {isSpanish
            ? 'Los inicios y cierres de sesión registrados aparecerán aquí.'
            : 'Recorded sign-ins and sign-outs will appear here.'}
        </p>
      </div>
    );
  }
  return (
    <ListGrid
      label={isSpanish ? 'Historial de acceso' : 'Login history'}
      locale={locale}
      searchable={false}
      controlled={{ page: 1, pageSize: 250, totalCount: entries.length }}
      columns={[
        { key: 'user', label: isSpanish ? 'Usuario' : 'User' },
        { key: 'timestamp', label: isSpanish ? 'Fecha y hora' : 'Timestamp' },
        { key: 'outcome', label: isSpanish ? 'Resultado' : 'Outcome' },
        { key: 'source', label: isSpanish ? 'Origen' : 'Source' },
      ]}
      rows={entries.map((entry) => ({
        id: entry.id,
        cells: {
          user: { text: entry.userName },
          timestamp: { text: formatDate(entry.occurredAt), sortValue: entry.occurredAt },
          outcome: { text: outcomeLabel(entry.eventType, isSpanish), badge: entry.eventType === 'signed_out' ? 'muted' as const : 'default' as const },
          source: { text: entry.source },
        },
      }))}
    />
  );
}
