import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';
import BackButton from '@/components/back-button';
import { isSupplierHomeReturn, supplierReturnContext } from '@/lib/supplier-return-context';

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
  const returnContext = supplierReturnContext(query?.returnTo, query?.focusRow);
  let backLabel = es ? 'Volver a proveedores' : 'Back to suppliers';
  if (isSupplierHomeReturn(returnContext.href)) {
    backLabel = es ? 'Volver al inicio' : 'Back to Home';
  } else if (returnContext.href.startsWith('/app/ingredients/')) {
    backLabel = es ? 'Volver al ingrediente' : 'Back to ingredient';
  }
  return (
    <>
      <BackButton
        href={returnContext.href}
        label={backLabel}
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
