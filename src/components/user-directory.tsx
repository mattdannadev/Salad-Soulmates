import type { ManagedUser } from '@/lib/user-management-data';
import Link from 'next/link';
import { userDetailHref } from '@/app/app/user-management/users/return-context';
import ListGrid from './list-grid';

function initials(user: ManagedUser) {
  return `${user.firstName.at(0) ?? ''}${user.lastName.at(0) ?? ''}`.toLocaleUpperCase();
}

export default function UserDirectory({
  users, directoryHref, focusRowId = undefined, totalUsers, hasSearch, locale,
}: {
  users: ManagedUser[];
  directoryHref: string;
  focusRowId?: string;
  totalUsers: number;
  hasSearch: boolean;
  locale: 'en' | 'es';
}) {
  const isSpanish = locale === 'es';
  const statusLabels = isSpanish
    ? { active: 'Activo', inactive: 'Inactivo' }
    : { active: 'Active', inactive: 'Inactive' };
  if (!users.length) {
    const noMatches = totalUsers > 0 && hasSearch;
    let emptyTitle = isSpanish ? 'Aún no hay usuarios' : 'No users yet';
    let emptyDescription = isSpanish
      ? 'Invite a un usuario con el formulario de abajo.'
      : 'Invite a user with the form below.';
    if (noMatches) {
      emptyTitle = isSpanish ? 'No hay usuarios que coincidan' : 'No matching users';
      emptyDescription = isSpanish
        ? 'Pruebe otra búsqueda o borre los filtros.'
        : 'Try another search or clear the filters.';
    }
    return (
      <div className="empty" role="status">
        <h2>{emptyTitle}</h2>
        <p>{emptyDescription}</p>
        {noMatches && <Link href="/app/user-management/users">{isSpanish ? 'Borrar todos los filtros' : 'Clear all filters'}</Link>}
      </div>
    );
  }
  return (
    <ListGrid
      label={isSpanish ? 'Directorio de usuarios' : 'User directory'}
      columns={[
        { key: 'user', label: isSpanish ? 'Usuario' : 'User' },
        { key: 'email', label: isSpanish ? 'Correo electrónico' : 'Email', minWidth: 220 },
        { key: 'facility', label: isSpanish ? 'Centro' : 'Facility' },
        { key: 'access', label: isSpanish ? 'Acceso' : 'Access' },
        { key: 'status', label: isSpanish ? 'Estado' : 'Status' },
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
          status: {
            text: user.active ? statusLabels.active : statusLabels.inactive,
            badge: user.active ? 'default' as const : 'muted' as const,
          },
        },
      }))}
      searchable={false}
      focusRowId={focusRowId}
    />
  );
}
