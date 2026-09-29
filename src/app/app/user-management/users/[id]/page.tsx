import { PageHeader } from '@/components/shell';
import BackButton from '@/components/back-button';
import UserAccountActions from '@/components/user-account-actions';
import { CopilotUserAccess } from '@/components/operations-copilot-access';
import { loadManagedUser } from '@/lib/user-management-data';
import styles from '@/components/user-management.module.css';
import { userReturnContext, userReturnHref } from '../return-context';

function formatTimestamp(timestamp: string) {
  return new Intl.DateTimeFormat('en-US', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(timestamp));
}

export default async function UserDetail({
  params, searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ returnTo?: string | string[]; focusRow?: string | string[] }>;
}) {
  const { id } = await params;
  const query = await searchParams;
  const returnContext = userReturnContext(query.returnTo, query.focusRow);
  const returnHref = userReturnHref(returnContext, id);
  const { user, actorUserId, accessProfiles } = await loadManagedUser(id);
  const fullName = `${user.firstName} ${user.lastName}`;
  let activity = <p>Login history requires audit access.</p>;
  if (user.loginHistory !== null) {
    activity = user.loginHistory.length ? (
      <ul className={styles.historyList}>
        {user.loginHistory.map((event) => (
          <li key={event.id}>
            <span>{event.event_type === 'signed_in' ? 'Signed in' : 'Signed out'}</span>
            <time dateTime={event.occurred_at}>{formatTimestamp(event.occurred_at)}</time>
          </li>
        ))}
      </ul>
    ) : <p>No login activity has been recorded yet.</p>;
  }
  return (
    <>
      <BackButton href={returnHref} label="Back to users" />
      <PageHeader
        eyebrow="USER MANAGEMENT"
        title={fullName}
        description="Review this user’s profile, access, and account security."
      />
      <div className={styles.detailGrid}>
        <section className="panel" aria-labelledby="profile-heading">
          <h2 id="profile-heading">User profile</h2>
          <dl className={styles.profileFacts}>
            <div>
              <dt>First name</dt>
              <dd>{user.firstName}</dd>
            </div>
            <div>
              <dt>Last name</dt>
              <dd>{user.lastName}</dd>
            </div>
            <div className={styles.wideFact}>
              <dt>Work email</dt>
              <dd>{user.workEmail ?? 'Not recorded in the application profile'}</dd>
            </div>
            <div>
              <dt>Status</dt>
              <dd>{user.active ? 'Active' : 'Inactive'}</dd>
            </div>
            <div>
              <dt>Default language</dt>
              <dd>{user.preferredLocale === 'es' ? 'Español' : 'English'}</dd>
            </div>
            <div>
              <dt>Facility</dt>
              <dd>{user.facilityName}</dd>
            </div>
            <div>
              <dt>Access profile</dt>
              <dd>{user.accessProfileName}</dd>
            </div>
            <div>
              <dt>Workspace role</dt>
              <dd>{user.role}</dd>
            </div>
            {user.deactivatedAt ? (
              <div>
                <dt>Deactivated</dt>
                <dd>{formatTimestamp(user.deactivatedAt)}</dd>
              </div>
            ) : null}
            {user.deactivationReason ? (
              <div className={styles.wideFact}>
                <dt>Deactivation reason</dt>
                <dd>{user.deactivationReason}</dd>
              </div>
            ) : null}
          </dl>
        </section>
        <section className="panel" aria-labelledby="activity-heading">
          <h2 id="activity-heading">Recent account activity</h2>
          {activity}
        </section>
      </div>
      <CopilotUserAccess
        userId={user.id}
        override={user.operationsCopilotOverride ?? null}
        profileDefault={user.operationsCopilotProfileDefault ?? false}
        planEnabled={user.operationsCopilotPlanEnabled ?? false}
      />
      <UserAccountActions
        userId={user.id}
        userName={fullName}
        active={user.active}
        isCurrentUser={user.id === actorUserId}
        currentAccessProfileId={user.accessProfileId}
        accessProfiles={accessProfiles}
        returnHref={returnHref}
      />
    </>
  );
}
