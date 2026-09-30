import styles from './provider-customer-accounts.module.css';

export interface ProviderCustomerAccountSummary {
  id: string;
  name: string;
  status: 'active' | 'suspended' | 'archived';
  linkedTenantCount: number;
}

export type ProviderCustomerAccountDirectoryState = | { kind: 'loading' }
  | { kind: 'ready'; accounts: ProviderCustomerAccountSummary[] }
  | { kind: 'denied' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

interface ProviderCustomerAccountDirectoryProps {
  state: ProviderCustomerAccountDirectoryState;
  accountHref: (accountId: string) => string;
  tenantsHref?: string;
}

export function ProviderCustomerAccountStatus({ status }: Pick<ProviderCustomerAccountSummary, 'status'>) {
  const label = { active: 'Active', suspended: 'Suspended', archived: 'Archived' }[status];
  return <span className={styles[status]}>{label}</span>;
}

function DirectoryContent({ state, accountHref }: Pick<ProviderCustomerAccountDirectoryProps, 'state' | 'accountHref'>) {
  if (state.kind === 'loading') return <p className={styles.message} role="status">Loading customer accounts…</p>;
  if (state.kind === 'denied') return <p className={styles.message} role="alert">Provider access is required to view customer accounts.</p>;
  if (state.kind === 'not-found') return <p className={styles.message} role="status">Customer accounts not found.</p>;
  if (state.kind === 'unavailable') return <p className={styles.message} role="alert">Customer accounts are temporarily unavailable.</p>;
  if (state.accounts.length === 0) return <p className={styles.message} role="status">No customer accounts found.</p>;

  return (
    <div className={styles.tableScroll}>
      <table className={styles.table}>
        <caption className={styles.srOnly}>Provider customer account directory</caption>
        <thead>
          <tr>
            <th scope="col">Account</th>
            <th scope="col">Status</th>
            <th scope="col">Linked tenants</th>
          </tr>
        </thead>
        <tbody>
          {state.accounts.map((account) => (
            <tr key={account.id}>
              <th scope="row"><a href={accountHref(account.id)}>{account.name}</a></th>
              <td><ProviderCustomerAccountStatus status={account.status} /></td>
              <td>{account.linkedTenantCount.toLocaleString('en-US')}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ProviderCustomerAccountDirectory({
  state, accountHref, tenantsHref = undefined,
}: ProviderCustomerAccountDirectoryProps) {
  return (
    <div className={styles.portal}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Salad Soulmates</span>
        <span className={styles.topbarLabel}>Provider Console</span>
      </header>
      <main className={styles.main}>
        {tenantsHref && <nav aria-label="Provider navigation" className={styles.navigation}><a href={tenantsHref}>Back to tenants</a></nav>}
        <div className={styles.hero}>
          <p className={styles.kicker}>PROVIDER CONSOLE</p>
          <h1>Customer accounts</h1>
          <p>View account status and linked tenant counts.</p>
        </div>
        <section aria-labelledby="provider-customer-accounts-title" className={styles.panel}>
          <div className={styles.panelHeading}>
            <h2 id="provider-customer-accounts-title">Customer account directory</h2>
            {state.kind === 'ready' && <span className={styles.count}>{state.accounts.length.toLocaleString('en-US')}</span>}
          </div>
          <DirectoryContent state={state} accountHref={accountHref} />
        </section>
      </main>
    </div>
  );
}
