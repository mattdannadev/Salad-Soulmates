import Link from 'next/link';
import styles from './provider-directory.module.css';

export interface ProviderTenantSummary {
  id: string;
  name: string;
  slug: string;
  status: 'active' | 'suspended';
  createdAt: string;
  enabledUserCount: number;
  facilityCount: number;
}

export type ProviderDirectoryState = | { kind: 'loading' }
  | { kind: 'ready'; tenants: ProviderTenantSummary[] }
  | { kind: 'error' }
  | { kind: 'denied' }
  | { kind: 'unavailable' };

interface ProviderDirectoryProps {
  state: ProviderDirectoryState;
}

function formatCreatedAt(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-US', { dateStyle: 'medium', timeZone: 'UTC' }).format(date);
}

function DirectoryContent({ state }: ProviderDirectoryProps) {
  if (state.kind === 'loading') {
    return (
      <p className={styles.message} role="status">
        Loading tenants…
      </p>
    );
  }
  if (state.kind === 'denied') {
    return (
      <p className={styles.message} role="alert">
        Provider access is required to view tenants.
      </p>
    );
  }
  if (state.kind === 'error') {
    return (
      <p className={styles.message} role="alert">
        Tenants could not be loaded. Please try again later.
      </p>
    );
  }
  if (state.kind === 'unavailable') {
    return (
      <p className={styles.message} role="status">
        The tenant directory is temporarily unavailable.
      </p>
    );
  }
  if (state.tenants.length === 0) {
    return (
      <p className={styles.message} role="status">
        No tenants found.
      </p>
    );
  }

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Provider tenant directory</caption>
        <thead>
          <tr>
            <th scope="col">Tenant</th>
            <th scope="col">Slug</th>
            <th scope="col">Status</th>
            <th scope="col">Facilities</th>
            <th scope="col">Enabled users</th>
            <th scope="col">Created</th>
          </tr>
        </thead>
        <tbody>
          {state.tenants.map((tenant) => (
            <tr key={tenant.id}>
              <th scope="row">
                <Link href={`/admin/provider/${tenant.id}`}>{tenant.name}</Link>
              </th>
              <td className={styles.slug}>{tenant.slug}</td>
              <td>
                <span className={tenant.status === 'active' ? styles.active : styles.suspended}>
                  {tenant.status === 'active' ? 'Active' : 'Suspended'}
                </span>
              </td>
              <td>{tenant.facilityCount.toLocaleString('en-US')}</td>
              <td>{tenant.enabledUserCount.toLocaleString('en-US')}</td>
              <td>{formatCreatedAt(tenant.createdAt)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProviderDirectory({ state }: ProviderDirectoryProps) {
  return (
    <div className={styles.portal}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Salad Soulmates</span>
        <span className={styles.topbarLabel}>Provider Console</span>
        <Link href="/admin/provider/customers">Customer accounts</Link>
        <Link href="/admin/provider/reauth">Confirm password</Link>
      </header>
      <main className={styles.main}>
        <div className={styles.hero}>
          <p className={styles.kicker}>PROVIDER CONSOLE</p>
          <h1>Tenants</h1>
          <p>View tenant identity and access status.</p>
        </div>
        <section aria-labelledby="provider-tenants-title" className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2 id="provider-tenants-title">Tenant directory</h2>
            {state.kind === 'ready' && (
              <span className={styles.count}>{state.tenants.length.toLocaleString('en-US')}</span>
            )}
          </div>
          <DirectoryContent state={state} />
        </section>
      </main>
    </div>
  );
}
