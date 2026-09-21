import { formatDate } from '@/domain/format';

export interface LoginHistoryEntry {
  id: string;
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
    <div className="table-wrap">
      <table>
        <thead>
          <tr>
            <th>{isSpanish ? 'Usuario' : 'User'}</th>
            <th>{isSpanish ? 'Fecha y hora' : 'Timestamp'}</th>
            <th>{isSpanish ? 'Resultado' : 'Outcome'}</th>
            <th>{isSpanish ? 'Origen' : 'Source'}</th>
          </tr>
        </thead>
        <tbody>
          {entries.map((entry) => (
            <tr key={entry.id}>
              <td>{entry.userName}</td>
              <td>{formatDate(entry.occurredAt)}</td>
              <td>
                <span className={`badge${entry.eventType === 'signed_out' ? ' muted' : ''}`}>
                  {outcomeLabel(entry.eventType, isSpanish)}
                </span>
              </td>
              <td className="login-event-source" title={entry.source}>{entry.source}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
