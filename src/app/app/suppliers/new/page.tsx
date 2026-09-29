import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';
import BackButton from '@/components/back-button';
import { resolveReturnContext } from '@/lib/return-context';

export default async function NewSupplier({
  searchParams,
}: {
  searchParams?: Promise<{ returnTo?: string | string[]; focusRow?: string | string[] }>;
} = {}) {
  const { db, profile } = await requireAdminShell();
  const access = await Promise.all(
    ['master_data.read', 'master_data.write'].map((permission) => hasPermission(db, permission)),
  );
  if (profile.role !== 'admin' || !access.every(Boolean)) redirect('/app/suppliers');
  const es = profile.preferred_locale === 'es';
  const query = await searchParams;
  const returnContext = resolveReturnContext(query?.returnTo, query?.focusRow, {
    fallbackHref: '/app/suppliers',
    isAllowedPathname: (pathname) => pathname === '/app/suppliers',
  });
  return (
    <>
      <BackButton
        href={returnContext.href}
        label={es ? 'Volver a proveedores' : 'Back to suppliers'}
      />
      <PageHeader
        eyebrow={es ? 'NUESTROS PROVEEDORES' : 'OUR PARTNERS'}
        title={es ? 'Agregar proveedor' : 'Add supplier'}
        description={
          es
            ? 'Guarda los datos de contacto y el plazo de entrega del proveedor.'
            : 'Save supplier contact details and their usual lead time.'
        }
      />
      <section className="panel">
        <SupplierForm returnHref={returnContext.href} locale={es ? 'es' : 'en'} />
      </section>
    </>
  );
}
