import type { ManagedUser } from '@/lib/user-management-data';
import { userDetailHref } from '@/app/app/user-management/users/return-context';
import ListGrid from './list-grid';

function initials(user: ManagedUser) {
  return `${user.firstName.at(0) ?? ''}${user.lastName.at(0) ?? ''}`.toLocaleUpperCase();
}

export default function UserDirectory({
  users, directoryHref, focusRowId = undefined,
}: { users: ManagedUser[]; directoryHref: string; focusRowId?: string }) {
  if (!users.length) {
    return (
      <div className="empty">
        <h2>No users found</h2>
        <p>Try a different search, or invite a user below.</p>
      </div>
    );
  }
  return (
    <ListGrid
      label="User directory"
      columns={[
        { key: 'user', label: 'User' },
        { key: 'email', label: 'Email', minWidth: 220 },
        { key: 'facility', label: 'Facility' },
        { key: 'access', label: 'Access' },
        { key: 'status', label: 'Status' },
      ]}
      rows={users.map((user) => ({
        id: user.id,
        cells: {
          user: {
            text: `${user.firstName} ${user.lastName}`,
            href: userDetailHref(user.id, directoryHref),
            secondary: initials(user),
          },
          email: { text: user.workEmail ?? '—' },
          facility: { text: user.facilityName },
          access: { text: user.accessProfileName },
          status: { text: user.active ? 'Active' : 'Inactive', badge: user.active ? 'default' as const : 'muted' as const },
        },
      }))}
      searchable={false}
      focusRowId={focusRowId}
    />
  );
}
