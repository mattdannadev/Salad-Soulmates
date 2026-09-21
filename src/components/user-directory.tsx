import Link from 'next/link';
import type { ManagedUser } from '@/lib/user-management-data';
import styles from './user-management.module.css';

function initials(user: ManagedUser) {
  return `${user.firstName.at(0) ?? ''}${user.lastName.at(0) ?? ''}`.toLocaleUpperCase();
}

export default function UserDirectory({ users }: { users: ManagedUser[] }) {
  if (!users.length) {
    return (
      <div className="empty">
        <h2>No users found</h2>
        <p>Try a different search, or invite a user below.</p>
      </div>
    );
  }
  return (
    <div className={styles.userGrid} role="region" aria-label="User directory">
      {users.map((user) => (
        <article className={styles.userCard} key={user.id}>
          <div className={styles.cardHeading}>
            <span className={styles.avatar} aria-hidden="true">{initials(user)}</span>
            <span className={user.active ? styles.activeBadge : styles.inactiveBadge}>
              {user.active ? 'Active' : 'Inactive'}
            </span>
          </div>
          <div>
            <h2>{`${user.firstName} ${user.lastName}`}</h2>
            <p className={styles.email}>{user.workEmail ?? 'Email not recorded'}</p>
          </div>
          <dl className={styles.cardFacts}>
            <div>
              <dt>Facility</dt>
              <dd>{user.facilityName}</dd>
            </div>
            <div>
              <dt>Access</dt>
              <dd>{user.accessProfileName}</dd>
            </div>
          </dl>
          <Link href={`/app/user-management/users/${user.id}`}>
            View user profile
            <span aria-hidden="true"> →</span>
          </Link>
        </article>
      ))}
    </div>
  );
}
