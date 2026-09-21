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
    <div className={styles.directoryTableWrap} role="region" aria-label="User directory">
      <table className={styles.directoryTable}>
        <thead>
          <tr>
            <th scope="col">User</th>
            <th scope="col">Email</th>
            <th scope="col">Facility</th>
            <th scope="col">Access</th>
            <th scope="col">Status</th>
            <th scope="col"><span className="sr-only">Profile</span></th>
          </tr>
        </thead>
        <tbody>
          {users.map((user) => (
            <tr key={user.id}>
              <th scope="row">
                <Link className={styles.userName} href={`/app/user-management/users/${user.id}`}>
                  <span className={styles.avatar} aria-hidden="true">{initials(user)}</span>
                  {`${user.firstName} ${user.lastName}`}
                </Link>
              </th>
              <td className={styles.email}>{user.workEmail ?? '—'}</td>
              <td>{user.facilityName}</td>
              <td>{user.accessProfileName}</td>
              <td>
                <span className={user.active ? styles.activeBadge : styles.inactiveBadge}>
                  {user.active ? 'Active' : 'Inactive'}
                </span>
              </td>
              <td>
                <Link href={`/app/user-management/users/${user.id}`}>
                  View profile
                  <span aria-hidden="true"> →</span>
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
