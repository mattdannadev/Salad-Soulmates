import Link from 'next/link';
import { ArrowUpRight, Building2, Leaf } from 'lucide-react';
import { listOrganizations, requirePlatformAdmin } from '@/services/platform-admin';
import {
  CreateOrganizationControl,
  EmptyOrganizations,
  OrganizationStatusControl,
  type OrganizationFormAction,
  type OrganizationSummary,
} from '@/components/admin/organization-controls';
import styles from '@/components/admin/portal.module.css';
import { changeOrganizationStatus, createOrganization } from './actions';

export const dynamic = 'force-dynamic';

interface AdminPortalProps {
  organizations: OrganizationSummary[];
  createAction?: OrganizationFormAction;
  statusAction?: OrganizationFormAction;
  notice?: string;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

export function AdminPortal({
  organizations,
  createAction = undefined,
  statusAction = undefined,
  notice = undefined,
}: AdminPortalProps) {
  const activeCount = organizations.filter((organization) => organization.status === 'active').length;
  const enabledUserCount = organizations.reduce(
    (total, organization) => total + organization.enabledUserCount,
    0,
  );

  return (
    <div className={styles.portal}>
      <header className={styles.topbar}>
        <div className={styles.brand}>
          <span className={styles.brandIcon}><Leaf size={21} aria-hidden="true" /></span>
          <span className={styles.brandText}>
            <span>Salad Soulmates</span>
            <small>Administration</small>
          </span>
        </div>
        <Link className={styles.topbarLink} href="/app">
          Operational workspace
          <ArrowUpRight size={15} aria-hidden="true" />
        </Link>
      </header>

      <main className={styles.main}>
        <div className={styles.hero}>
          <div>
            <p className={styles.kicker}>PLATFORM ADMINISTRATION</p>
            <h1>Organizations</h1>
            <p>Manage organization access and the workspaces available on this platform.</p>
          </div>
          <CreateOrganizationControl action={createAction} />
        </div>

        {notice && <p className={styles.notice} role="status">{notice}</p>}
        {!createAction && !statusAction && (
          <p className={styles.notice} role="status">
            Organization management actions are temporarily unavailable.
          </p>
        )}

        <div aria-label="Organization summary" className={styles.summary}>
          <div className={styles.summaryCard}>
            <span>Total organizations</span>
            <strong>{organizations.length.toLocaleString('en-US')}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>Active organizations</span>
            <strong>{activeCount.toLocaleString('en-US')}</strong>
          </div>
          <div className={styles.summaryCard}>
            <span>Enabled users</span>
            <strong>{enabledUserCount.toLocaleString('en-US')}</strong>
          </div>
        </div>

        <section aria-labelledby="organization-list-title" className={styles.panel}>
          <div className={styles.panelHeading}>
            <div>
              <h2 id="organization-list-title">All organizations</h2>
              <p>Workspace status and access at a glance.</p>
            </div>
            <span className={styles.count}>{organizations.length}</span>
          </div>
          {organizations.length === 0 ? (
            <EmptyOrganizations />
          ) : (
            <div className={styles.tableScroll}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th scope="col">Organization</th>
                    <th scope="col">Slug</th>
                    <th scope="col">Status</th>
                    <th scope="col">Enabled users</th>
                    <th scope="col">Created</th>
                    <th scope="col"><span className="sr-only">Actions</span></th>
                  </tr>
                </thead>
                <tbody>
                  {organizations.map((organization) => (
                    <tr key={organization.id}>
                      <td>
                        <span className={styles.organizationName}>
                          <span className={styles.organizationIcon}>
                            <Building2 size={17} aria-hidden="true" />
                          </span>
                          {organization.name}
                        </span>
                      </td>
                      <td><span className={styles.slug}>{organization.slug}</span></td>
                      <td>
                        <span
                          className={`${styles.status} ${organization.status === 'suspended' ? styles.suspended : ''}`}
                        >
                          {organization.status === 'suspended' ? 'Suspended' : 'Active'}
                        </span>
                      </td>
                      <td>{organization.enabledUserCount.toLocaleString('en-US')}</td>
                      <td>{formatCreatedAt(organization.createdAt)}</td>
                      <td>
                        <OrganizationStatusControl
                          action={statusAction}
                          organization={organization}
                        />
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>
      </main>
    </div>
  );
}

export default async function AdminPage() {
  await requirePlatformAdmin();
  const organizations = await listOrganizations();
  return (
    <AdminPortal
      createAction={createOrganization}
      organizations={organizations}
      statusAction={changeOrganizationStatus}
    />
  );
}
