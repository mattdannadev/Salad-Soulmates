import Link from 'next/link';
import { ArrowUpRight, Leaf } from 'lucide-react';
import ListGrid from '@/components/list-grid';
import { listOrganizations, requirePlatformAdmin } from '@/services/platform-admin';
import {
  CreateOrganizationControl,
  EmptyOrganizations,
  OperationsCopilotPlanControl,
  OrganizationStatusControl,
  type OrganizationFormAction,
  type OrganizationSummary,
} from '@/components/admin/organization-controls';
import styles from '@/components/admin/portal.module.css';
import {
  changeOperationsCopilotPlan,
  changeOrganizationStatus,
  createOrganization,
} from './actions';

export const dynamic = 'force-dynamic';

interface AdminPortalProps {
  organizations: OrganizationSummary[];
  createAction?: OrganizationFormAction;
  statusAction?: OrganizationFormAction;
  operationsCopilotPlanAction?: OrganizationFormAction;
  notice?: string;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function operationsCopilotNotice(value: string | undefined): string | undefined {
  if (value === 'copilot-enabled') {
    return 'Operations Copilot plan access is now enabled. The tenant administrator can assign profile and user access.';
  }
  if (value === 'copilot-disabled') {
    return 'Operations Copilot plan access is now disabled. Existing tenant assignments are preserved.';
  }
  return undefined;
}

export function AdminPortal({
  organizations,
  createAction = undefined,
  statusAction = undefined,
  operationsCopilotPlanAction = undefined,
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
            <ListGrid
              label="Organizations"
              columns={[
                { key: 'organization', label: 'Organization' },
                { key: 'slug', label: 'Slug' },
                { key: 'status', label: 'Status' },
                { key: 'copilot', label: 'Operations Copilot' },
                { key: 'users', label: 'Enabled users' },
                { key: 'created', label: 'Created' },
                {
                  key: 'actions', label: 'Actions', sortable: false, filterable: false,
                },
              ]}
              rows={organizations.map((organization) => ({
                id: organization.id,
                cells: {
                  organization: { text: organization.name },
                  slug: { text: organization.slug },
                  status: {
                    text: organization.status === 'suspended' ? 'Suspended' : 'Active',
                    badge: organization.status === 'suspended' ? 'muted' as const : 'default' as const,
                  },
                  users: {
                    text: organization.enabledUserCount.toLocaleString('en-US'),
                    sortValue: organization.enabledUserCount,
                  },
                  copilot: {
                    text: organization.operationsCopilotPlanEnabled ? 'Plan enabled' : 'Not in plan',
                    badge: organization.operationsCopilotPlanEnabled ? 'default' as const : 'muted' as const,
                  },
                  created: {
                    text: formatCreatedAt(organization.createdAt),
                    sortValue: organization.createdAt,
                  },
                  actions: { text: 'Status actions', slot: organization.id },
                },
              }))}
              cellSlots={Object.fromEntries(organizations.map((organization) => [
                organization.id,
                <div className={styles.rowActions} key={organization.id}>
                  <OperationsCopilotPlanControl
                    action={operationsCopilotPlanAction}
                    organization={organization}
                  />
                  <OrganizationStatusControl
                    action={statusAction}
                    organization={organization}
                  />
                </div>,
              ]))}
            />
          )}
        </section>
      </main>
    </div>
  );
}

export default async function AdminPage({
  searchParams,
}: {
  searchParams: Promise<{ notice?: string }>;
}) {
  await requirePlatformAdmin();
  const [organizations, query] = await Promise.all([listOrganizations(), searchParams]);
  return (
    <AdminPortal
      createAction={createOrganization}
      notice={operationsCopilotNotice(query.notice)}
      organizations={organizations}
      operationsCopilotPlanAction={changeOperationsCopilotPlan}
      statusAction={changeOrganizationStatus}
    />
  );
}
