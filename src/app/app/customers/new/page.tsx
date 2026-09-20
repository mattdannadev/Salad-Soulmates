import Link from 'next/link';
import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell';
import CustomerForm from '@/components/customer-form';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';

export default async function NewCustomer() {
  const { db, profile } = await requireAdminShell();
  const allowed = await Promise.all(
    ['orders.read', 'orders.write'].map((permission) => hasPermission(db, permission)),
  );
  if (!allowed.every(Boolean)) redirect('/app/customers');
  const es = profile.preferred_locale === 'es';
  return (
    <>
      <Link className="back-link" href="/app/customers">
        {es ? '← Clientes' : '← Customers'}
      </Link>
      <PageHeader
        eyebrow={es ? 'CLIENTES' : 'CUSTOMERS'}
        title={es ? 'Agregar cliente' : 'Add customer'}
        description={
          es
            ? 'Guarda los datos del cliente antes de preparar un pedido.'
            : 'Save customer details before preparing an order.'
        }
      />
      <section className="panel">
        <CustomerForm locale={profile.preferred_locale} />
      </section>
    </>
  );
}
