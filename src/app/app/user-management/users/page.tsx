import { notFound } from 'next/navigation';
import { z } from 'zod';
import Link from 'next/link';
import { PageHeader } from '@/components/shell';
import UserDirectory from '@/components/user-directory';
import UserInvitationPanel from '@/components/user-invitation-panel';
import {
  loadUserDirectory,
  userDirectoryQuerySchema,
} from '@/lib/user-management-data';
import styles from '@/components/user-management.module.css';
import UserFocus from './user-focus';
import { userDirectoryHref } from './return-context';

export default async function Users({
  searchParams,
}: {
  searchParams: Promise<{
    q?: string | string[];
    sort?: string | string[];
    focusRow?: string | string[];
  }>;
}) {
  const rawQuery = await searchParams;
  const query = userDirectoryQuerySchema.safeParse({ q: rawQuery.q, sort: rawQuery.sort });
  if (!query.success) notFound();
  const { users, totalUsers } = await loadUserDirectory(query.data);
  const focusRow = z.uuid().safeParse(rawQuery.focusRow);
  const directoryHref = userDirectoryHref(query.data);
  return (
    <>
      {focusRow.success && users.some((user) => user.id === focusRow.data) ? (
        <UserFocus rowId={focusRow.data} />
      ) : null}
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
        <UserDirectory
          users={users}
          directoryHref={directoryHref}
          focusRowId={focusRow.success ? focusRow.data : undefined}
        />
      </section>
      <UserInvitationPanel />
    </>
  );
}
