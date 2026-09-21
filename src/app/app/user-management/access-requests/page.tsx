import { redirect } from 'next/navigation';
import { z } from 'zod';
import { rowSchemas } from '@/domain/master-data';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { rows, date, readResult } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import AccessRequestReview from '@/components/access-request-review';

export default async function AccessRequestsPage() {
  const { db, profile } = await requireAdminShell();
  const allowed = await hasPermission(db, 'access.manage');
  if (!allowed) redirect('/app');
  const [requests, facilities, accessProfiles] = await Promise.all([
    rows(db, 'access_requests', rowSchemas.access_requests),
    db.from('facilities').select('id,name').eq('active', true).order('name'),
    db.from('access_profiles').select('id,name,base_role').eq('active', true).order('name'),
  ]);
  const facilityRows = readResult(
    facilities,
    z.array(z.object({ id: z.uuid(), name: z.string() })),
    'access_facilities',
  );
  const profileRows = readResult(
    accessProfiles,
    rowSchemas.access_profiles.pick({ id: true, name: true, base_role: true }).array(),
    'access_profiles',
  );
  const open = requests
    .filter((request) => ['New', 'Contacted', 'Invited'].includes(request.status))
    .sort((left, right) => right.created_at.localeCompare(left.created_at));
  const isSpanish = profile.preferred_locale === 'es';
  return (
    <>
      <PageHeader
        eyebrow={isSpanish ? 'ADMINISTRACIÓN DE USUARIOS' : 'USER MANAGEMENT'}
        title={isSpanish ? 'Solicitudes de acceso' : 'Access Requests'}
        description={isSpanish
          ? 'Revise la identidad, asigne una instalación, un perfil y el idioma predeterminado, y luego envíe una invitación.'
          : 'Review identity, assign a facility, profile and default language, then send an invitation.'}
      />
      <section className="panel">
        <h2>{isSpanish ? 'Pendientes de aprobación' : 'Pending approval'}</h2>
        {open.length ? (
          <div className="request-list">
            {open.map((request) => (
              <article key={request.id} className="request-card">
                <div>
                  <h3>{request.display_name}</h3>
                  <p>{request.contact_value}</p>
                  <p>
                    <span className="badge">{request.requested_role}</span>
                    {' '}
                    <span className="badge">
                      {request.preferred_locale === 'es' ? 'Español' : 'English'}
                    </span>
                    {' '}
                    <span className="badge">{request.status}</span>
                  </p>
                  <small>
                    {isSpanish ? 'Solicitado ' : 'Requested '}
                    {date(request.created_at)}
                  </small>
                </div>
                <AccessRequestReview
                  id={request.id}
                  contactKind={request.contact_kind}
                  requestedRole={request.requested_role}
                  facilities={facilityRows}
                  profiles={profileRows}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>
              {isSpanish
                ? 'No hay solicitudes de acceso pendientes'
                : 'No access requests are waiting'}
            </h3>
            <p>
              {isSpanish
                ? 'Las nuevas solicitudes de cuenta aparecerán aquí para un administrador.'
                : 'New account requests will appear here for an administrator.'}
            </p>
          </div>
        )}
      </section>
    </>
  );
}
