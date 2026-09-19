import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import { rows, date } from '@/lib/data';
import { PageHeader } from '@/components/shell';
import { AccessRequestReview } from '@/components/access-request-review';
import type { AccessRequest } from '@/domain/master-data';

export default async function AccessRequests() {
  const { db } = await requireAdminShell();
  const { data: allowed } = await db.rpc('has_permission', { requested: 'access.manage' });
  if (!allowed) redirect('/app');
  const [requests, facilities, accessProfiles] = await Promise.all([
    rows<AccessRequest>(db, 'access_requests'),
    db.from('facilities').select('id,name').eq('active', true).order('name'),
    db.from('access_profiles').select('id,name,base_role').eq('active', true).order('name'),
  ]);
  if (facilities.error || accessProfiles.error) throw new Error('Unable to load access settings.');
  const open = requests
    .filter((r) => ['New', 'Contacted', 'Invited'].includes(r.status))
    .sort((a, b) => b.created_at.localeCompare(a.created_at));
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Access requests"
        description="Review identity, assign a facility, role and default language, then send an invitation."
      />
      <section className="panel">
        <h2>Pending approval</h2>
        {open.length ? (
          <div className="request-list">
            {open.map((request) => (
              <article key={request.id} className="request-card">
                <div>
                  <h3>{request.display_name}</h3>
                  <p>{request.contact_value}</p>
                  <p>
                    <span className="badge">{request.requested_role}</span>{' '}
                    <span className="badge">
                      {request.preferred_locale === 'es' ? 'Español' : 'English'}
                    </span>{' '}
                    <span className="badge">{request.status}</span>
                  </p>
                  <small>Requested {date(request.created_at)}</small>
                </div>
                <AccessRequestReview
                  id={request.id}
                  contactKind={request.contact_kind}
                  requestedRole={request.requested_role}
                  facilities={facilities.data ?? []}
                  profiles={accessProfiles.data ?? []}
                />
              </article>
            ))}
          </div>
        ) : (
          <div className="empty">
            <h3>No access requests are waiting</h3>
            <p>New account requests will appear here for an administrator.</p>
          </div>
        )}
      </section>
    </>
  );
}
