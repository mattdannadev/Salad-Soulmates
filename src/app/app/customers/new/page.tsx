import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/shell';
import CustomerForm from '@/components/customer-form';
import BackButton from '@/components/back-button';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { customerReturnContext, customerReturnHref } from '../return-context';

export default async function NewCustomer({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string; focusRow?: string }>;
}) {
  const query = await searchParams;
  const returnContext = customerReturnContext(query.returnTo, query.focusRow);
  const { db, profile } = await requireAdminShell();
  const allowed = await Promise.all(
    ['orders.read', 'orders.write'].map((permission) => hasPermission(db, permission)),
  );
  if (!allowed.every(Boolean)) redirect('/app/customers');
  const es = profile.preferred_locale === 'es';
  let backLabel = es ? 'Volver a clientes' : 'Back to customers';
  if (returnContext.href.startsWith('/app/orders')) {
    backLabel = es ? 'Volver a pedidos' : 'Back to orders';
  }
  return (
    <>
      <BackButton
        href={customerReturnHref(returnContext)}
        label={backLabel}
      />
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
        <CustomerForm locale={profile.preferred_locale} returnContext={returnContext} />
      </section>
    </>
  );
}
