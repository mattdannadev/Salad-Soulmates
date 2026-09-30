import Link from 'next/link';
import { redirect } from 'next/navigation';
import { requireAdminShell } from '@/lib/auth';
import hasPermission from '@/lib/permissions';
import { PageHeader } from '@/components/shell';
import { isSupplierHomeReturn, supplierReturnContext } from '@/lib/supplier-return-context';

export default async function SupplierCreated({
  searchParams,
}: {
  searchParams: Promise<{ returnTo?: string | string[] }>;
}) {
  const { db, profile } = await requireAdminShell();
  const access = await Promise.all(
    ['master_data.read', 'master_data.write'].map((permission) => hasPermission(db, permission)),
  );
  if (profile.role !== 'admin' || !access.every(Boolean)) redirect('/app/suppliers');

  const query = await searchParams;
  const returnHref = supplierReturnContext(query.returnTo, undefined).href;
  const es = profile.preferred_locale === 'es';
  let returnLabel = es ? 'Volver a proveedores' : 'Back to suppliers';
  if (isSupplierHomeReturn(returnHref)) returnLabel = es ? 'Volver al inicio' : 'Back to Home';

  return (
    <>
      <PageHeader
        eyebrow={es ? 'PROVEEDOR CREADO' : 'SUPPLIER CREATED'}
        title={es ? 'Proveedor guardado' : 'Supplier saved'}
        description={es
          ? 'El siguiente paso es asociar sus presentaciones de compra con los ingredientes que te suministra.'
          : 'Next, connect their purchasing packs to the ingredients they supply.'}
      />
      <section className="panel">
        <h2>{es ? 'Configurar presentaciones de compra' : 'Set up purchasing packs'}</h2>
        <p>
          {es
            ? 'Selecciona un ingrediente y abre “Presentaciones de proveedor” para agregar la cantidad, unidad y SKU de este proveedor. Estas opciones se configuran por ingrediente.'
            : 'Choose an ingredient, then open Supplier packs to add this supplier’s quantity, unit, and SKU. Packs are set up for each ingredient.'}
        </p>
        <p>
          <Link className="button" href="/app/ingredients?status=active">
            {es ? 'Elegir ingrediente' : 'Choose an ingredient'}
          </Link>
        </p>
        <p><Link href={returnHref}>{returnLabel}</Link></p>
      </section>
    </>
  );
}
