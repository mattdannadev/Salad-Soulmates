import loadSupplierWorkspace from '@/lib/supplier-data';
import { purchaseProgress } from '@/domain/supplier-orders';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';
import SupplierPurchases from '@/components/supplier-purchases';
import SupplierDetailLink from '@/components/supplier-detail-link';
import Link from 'next/link';

export default async function Suppliers() {
  const workspace = await loadSupplierWorkspace();
  const {
    suppliers, locale, canEdit, canReadPurchases,
  } = workspace;
  const es = locale === 'es';
  const activeLabel = es ? 'Activo' : 'Active';
  const inactiveLabel = es ? 'Inactivo' : 'Inactive';
  return (
    <>
      <PageHeader
        eyebrow={es ? 'NUESTROS PROVEEDORES' : 'OUR PARTNERS'}
        title={es ? 'Proveedores' : 'Suppliers'}
        action={
          canEdit && (
            <Link className="button" href="/app/suppliers/new">
              {es ? '+ Agregar proveedor' : '+ Add supplier'}
            </Link>
          )
        }
        description={
          es
            ? 'Consulta compras, entregas previstas y los pedidos de clientes relacionados.'
            : 'Track purchase orders, expected deliveries and the customer orders they support.'
        }
      />
      <section className="panel">
        <h2>{es ? 'Tus proveedores' : 'Your suppliers'}</h2>
        {!suppliers.length && (
          <div className="empty">
            <h3>{es ? 'Aún no hay proveedores' : 'No suppliers yet'}</h3>
            <p>
              {es
                ? 'Agrega un proveedor y configura sus presentaciones en cada ingrediente.'
                : 'Add a supplier, then connect their packs from an ingredient’s detail page.'}
            </p>
          </div>
        )}
        {!!suppliers.length && (
          <div className="table-wrap">
            <table aria-label={es ? 'Directorio de proveedores' : 'Supplier directory'}>
              <thead>
                <tr>
                  <th>{es ? 'Proveedor' : 'Supplier'}</th>
                  <th>{es ? 'Contacto' : 'Contact'}</th>
                  <th>{es ? 'Estado' : 'Status'}</th>
                  {canReadPurchases && <th>{es ? 'Compras abiertas' : 'Open purchase orders'}</th>}
                </tr>
              </thead>
              <tbody>
                {suppliers.map((supplier) => {
                  const openCount = workspace.drafts.filter(
                    (draft) => draft.supplier_id === supplier.id
                      && purchaseProgress(draft, workspace.lines, workspace.receipts).open,
                  ).length;
                  return (
                    <tr key={supplier.id}>
                      <td>
                        <SupplierDetailLink
                          supplierId={supplier.id}
                          supplierName={supplier.name}
                        />
                      </td>
                      <td>
                        {supplier.contact_name || '—'}
                        <br />
                        {supplier.email}
                        <br />
                        {supplier.phone}
                      </td>
                      <td>
                        <span className={`badge ${supplier.active ? '' : 'muted'}`}>
                          {supplier.active ? activeLabel : inactiveLabel}
                        </span>
                      </td>
                      {canReadPurchases && <td>{openCount}</td>}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {suppliers.map((supplier) => (
          <details className="supplier-orders" id={`supplier-${supplier.id}`} key={supplier.id}>
            <summary>
              {`${es ? 'Ver detalles' : 'View details'} · ${supplier.name}`}
            </summary>
            <SupplierPurchases supplier={supplier} workspace={workspace} />
            <details className="supplier-profile">
              <summary>
                {es ? 'Contacto y configuración' : 'Supplier contact & settings'}
              </summary>
              {canEdit ? (
                <SupplierForm supplier={supplier} />
              ) : (
                <p>{`${supplier.contact_name} · ${supplier.email || (es ? 'Sin correo' : 'No email')} · ${supplier.phone || (es ? 'Sin teléfono' : 'No phone')} · ${supplier.lead_time_days ?? 0} ${es ? 'días' : 'days'}`}</p>
              )}
            </details>
          </details>
        ))}
      </section>
    </>
  );
}
