import type { ProviderTenantSummary } from './provider-directory';
import { ProviderCustomerAccountStatus, type ProviderCustomerAccountSummary } from './provider-customer-account-directory';
import styles from './provider-customer-accounts.module.css';

export interface ProviderCustomerAccountDetail extends ProviderCustomerAccountSummary {
  linkedTenants: ProviderTenantSummary[];
}

export type ProviderCustomerAccountDetailState = | { kind: 'loading' }
  | { kind: 'ready'; account: ProviderCustomerAccountDetail }
  | { kind: 'denied' }
  | { kind: 'not-found' }
  | { kind: 'unavailable' };

interface ProviderCustomerAccountDetailProps {
  state: ProviderCustomerAccountDetailState;
  backHref: string;
  tenantHref: (tenantId: string) => string;
}

function DetailContent({ state, tenantHref }: Pick<ProviderCustomerAccountDetailProps, 'state' | 'tenantHref'>) {
  if (state.kind === 'loading') return <p className={styles.messageCard} role="status">Loading customer account…</p>;
  if (state.kind === 'denied') return <p className={styles.messageCard} role="alert">Provider access is required to view this customer account.</p>;
  if (state.kind === 'not-found') return <p className={styles.messageCard} role="status">Customer account not found.</p>;
  if (state.kind === 'unavailable') return <p className={styles.messageCard} role="alert">Customer account details are temporarily unavailable.</p>;

  const { account } = state;
  return (
    <>
      <section aria-labelledby="provider-customer-account-summary-title" className={styles.panel}>
        <h2 className={styles.detailHeading} id="provider-customer-account-summary-title">Account summary</h2>
        <dl className={styles.details}>
          <div>
            <dt>Name</dt>
            <dd>{account.name}</dd>
          </div>
          <div>
            <dt>Status</dt>
            <dd><ProviderCustomerAccountStatus status={account.status} /></dd>
          </div>
          <div>
            <dt>Linked tenants</dt>
            <dd>{account.linkedTenantCount.toLocaleString('en-US')}</dd>
          </div>
        </dl>
      </section>
      <section aria-labelledby="provider-customer-account-tenants-title" className={styles.panel}>
        <div className={styles.panelHeading}>
          <h2 id="provider-customer-account-tenants-title">Linked tenants</h2>
        </div>
        {account.linkedTenants.length === 0 ? (
          <p className={styles.message} role="status">No tenants are linked to this account.</p>
        ) : (
          <div className={styles.tableScroll}>
            <table className={styles.table}>
              <caption className={styles.srOnly}>Tenants linked to this customer account</caption>
              <thead>
                <tr>
                  <th scope="col">Tenant</th>
                  <th scope="col">Slug</th>
                  <th scope="col">Status</th>
                </tr>
              </thead>
              <tbody>
                {account.linkedTenants.map((tenant) => (
                  <tr key={tenant.id}>
                    <th scope="row"><a href={tenantHref(tenant.id)}>{tenant.name}</a></th>
                    <td className={styles.slug}>{tenant.slug}</td>
                    <td><span className={styles[tenant.status]}>{tenant.status === 'active' ? 'Active' : 'Suspended'}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  );
}

export default function ProviderCustomerAccountDetailView({
  state, backHref, tenantHref,
}: ProviderCustomerAccountDetailProps) {
  return (
    <div className={styles.portal}>
      <header className={styles.topbar}>
        <span className={styles.brand}>Salad Soulmates</span>
        <span className={styles.topbarLabel}>Provider Console</span>
      </header>
      <main className={styles.main}>
        <nav aria-label="Provider navigation" className={styles.navigation}><a href={backHref}>Back to customer accounts</a></nav>
        <div className={styles.hero}>
          <p className={styles.kicker}>PROVIDER CONSOLE</p>
          <h1>{state.kind === 'ready' ? state.account.name : 'Customer account details'}</h1>
          <p>Account status and linked tenants.</p>
        </div>
        <DetailContent state={state} tenantHref={tenantHref} />
      </main>
    </div>
  );
}
