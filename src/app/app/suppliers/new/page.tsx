import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';

export default async function NewSupplier() {
  const { db, profile } = await requireAdminShell();
  const access = await Promise.all(
    ['master_data.read', 'master_data.write'].map((permission) => hasPermission(db, permission)),
  );
  if (profile.role !== 'admin' || !access.every(Boolean)) redirect('/app/suppliers');
  const es = profile.preferred_locale === 'es';
  return (
    <>
      <Link className="back-link" href="/app/suppliers">
        {es ? '← Proveedores' : '← Suppliers'}
      </Link>
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
        <SupplierForm />
      </section>
    </>
  );
}
