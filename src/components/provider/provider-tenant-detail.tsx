import type { ProviderTenantSummary } from './provider-directory';
import styles from './provider-tenant-detail.module.css';

export interface ProviderTenantDetailSummary extends ProviderTenantSummary {
  linkedCustomerAccount?: { id: string; name: string; status: 'active' | 'suspended' | 'archived' };
}

export type ProviderTenantDetailState =
  | { kind: 'loading' }
  | { kind: 'ready'; tenant: ProviderTenantDetailSummary }
  | { kind: 'denied' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

interface ProviderTenantDetailProps {
  state: ProviderTenantDetailState;
  backHref: string;
  customerHref?: (accountId: string) => string;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function DetailContent({
  state,
  customerHref,
}: Pick<ProviderTenantDetailProps, 'state' | 'customerHref'>) {
  if (state.kind === 'loading') {
    return (
      <p className={styles.message} role="status">
        Loading tenant…
      </p>
    );
  }
  if (state.kind === 'denied') {
    return (
      <p className={styles.message} role="alert">
        Provider access is required to view this tenant.
      </p>
    );
  }
  if (state.kind === 'not-found') {
    return (
      <p className={styles.message} role="status">
        Tenant not found.
      </p>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <p className={styles.message} role="alert">
        Tenant details are temporarily unavailable.
      </p>
    );
  }

  const { tenant } = state;
  return (
    <section aria-labelledby="provider-tenant-summary-title" className={styles.panel}>
      <h2 id="provider-tenant-summary-title">Tenant summary</h2>
      <dl className={styles.details}>
        <div>
          <dt>Name</dt>
          <dd>{tenant.name}</dd>
        </div>
        <div>
          <dt>Slug</dt>
          <dd className={styles.slug}>{tenant.slug}</dd>
        </div>
        <div>
          <dt>Status</dt>
          <dd>
            <span className={tenant.status === 'active' ? styles.active : styles.suspended}>
              {tenant.status === 'active' ? 'Active' : 'Suspended'}
            </span>
          </dd>
        </div>
        <div>
          <dt>Created</dt>
          <dd>{formatCreatedAt(tenant.createdAt)}</dd>
        </div>
        <div>
          <dt>Enabled users</dt>
          <dd>{tenant.enabledUserCount.toLocaleString('en-US')}</dd>
        </div>
        <div>
          <dt>Facilities</dt>
          <dd>{tenant.facilityCount.toLocaleString('en-US')}</dd>
        </div>
      </dl>
      {tenant.linkedCustomerAccount && customerHref && (
        <div className={styles.linkedAccount}>
          <span>Customer account</span>
          <a href={customerHref(tenant.linkedCustomerAccount.id)}>
            {tenant.linkedCustomerAccount.name}
          </a>
        </div>
      )}
    </section>
  );
}

export default function ProviderTenantDetail({
  state,
  backHref,
  customerHref = undefined,
}: ProviderTenantDetailProps) {
  return (
    <div className={styles.portal}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Salad Soulmates</span>
        <span className={styles.topbarLabel}>Provider Console</span>
      </header>
      <main className={styles.main}>
        <nav aria-label="Provider navigation" className={styles.navigation}>
          <a href={backHref}>Back to tenants</a>
        </nav>
        <div className={styles.hero}>
          <p className={styles.kicker}>PROVIDER CONSOLE</p>
          <h1>{state.kind === 'ready' ? state.tenant.name : 'Tenant details'}</h1>
          <p>Tenant identity and access status.</p>
        </div>
        <DetailContent customerHref={customerHref} state={state} />
      </main>
    </div>
  );
}
