import { notFound } from 'next/navigation';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import UserDirectory from '@/components/user-directory';
import UserInvitationPanel from '@/components/user-invitation-panel';
import {
  loadUserDirectory,
  userDirectoryQuerySchema,
} from '@/lib/user-management-data';
import styles from '@/components/user-management.module.css';

export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{ q?: string | string[]; sort?: string | string[] }>;
}) {
  const query = userDirectoryQuerySchema.safeParse(await searchParams);
  if (!query.success) notFound();
  const { users, totalUsers } = await loadUserDirectory(query.data);
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Users"
        description="Find teammates, review access, create password-reset links, and safely deactivate accounts."
      />
      <section className="panel">
        <form className={styles.directoryControls} method="get">
          <label>
            Search users
            <input
              type="search"
              name="q"
              maxLength={120}
              defaultValue={query.data.q}
              placeholder="Name, email, facility, or access profile"
            />
          </label>
          <label>
            Sort by
            <select name="sort" defaultValue={query.data.sort}>
              <option value="last_name">Last name</option>
              <option value="first_name">First name</option>
            </select>
          </label>
          <button type="submit">Search</button>
          {(query.data.q || query.data.sort !== 'last_name') ? (
            <Link className="button secondary" href="/app/user-management/users">Clear</Link>
          ) : null}
        </form>
        <p className={styles.directorySummary} role="status">
          {query.data.q
            ? `${users.length} of ${totalUsers} users match “${query.data.q}”.`
            : `${totalUsers} ${totalUsers === 1 ? 'user' : 'users'}`}
        </p>
        <UserDirectory users={users} />
      </section>
      <UserInvitationPanel />
    </>
  );
}
