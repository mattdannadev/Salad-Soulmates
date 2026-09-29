import { notFound } from 'next/navigation';
import { z } from 'zod';
import { Suspense } from 'react';
import { requireAdminShell } from '@/lib/auth';
import { PageHeader } from '@/components/shell';
import DirectoryToolbar from '@/components/directory-toolbar';
import UserDirectory from '@/components/user-directory';
import UserInvitationPanel from '@/components/user-invitation-panel';
import {
  loadUserDirectory,
  userDirectoryQuerySchema,
} from '@/lib/user-management-data';
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
  const [{ users, totalUsers }, { profile }] = await Promise.all([
    loadUserDirectory(query.data),
    requireAdminShell(),
  ]);
  const locale = profile.preferred_locale;
  const isSpanish = locale === 'es';
  const focusRow = z.uuid().safeParse(rawQuery.focusRow);
  const directoryHref = userDirectoryHref(query.data);
  return (
    <>
      {focusRow.success && users.some((user) => user.id === focusRow.data) ? (
        <UserFocus rowId={focusRow.data} />
      ) : null}
      <PageHeader
        eyebrow={isSpanish ? 'ADMINISTRACIÓN' : 'ADMINISTRATION'}
        title={isSpanish ? 'Usuarios' : 'Users'}
        description={isSpanish
          ? 'Busque compañeros, revise el acceso, cree enlaces para restablecer contraseñas y desactive cuentas de forma segura.'
          : 'Find teammates, review access, create password-reset links, and safely deactivate accounts.'}
      />
      <section className="panel">
        <Suspense fallback={null}>
          <DirectoryToolbar
            label={isSpanish ? 'Buscar usuarios' : 'Search users'}
            resultCount={users.length}
            filters={[]}
            sortOptions={[
              { value: 'last_name', label: isSpanish ? 'Apellido' : 'Last name' },
              { value: 'first_name', label: isSpanish ? 'Nombre' : 'First name' },
            ]}
            locale={locale}
            mobileFilters
          />
        </Suspense>
        <UserDirectory
          users={users}
          directoryHref={directoryHref}
          focusRowId={focusRow.success ? focusRow.data : undefined}
          totalUsers={totalUsers}
          hasSearch={Boolean(query.data.q)}
          locale={locale}
        />
      </section>
      <UserInvitationPanel />
    </>
  );
}
