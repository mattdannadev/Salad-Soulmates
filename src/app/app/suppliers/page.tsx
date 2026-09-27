import loadSupplierWorkspace from '@/lib/supplier-data';
import { purchaseProgress } from '@/domain/supplier-orders';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';
import SupplierPurchases from '@/components/supplier-purchases';
import Link from 'next/link';
import ListGrid from '@/components/list-grid';
import { SupplierHashDetails } from '@/components/supplier-detail-link';

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
        <SupplierHashDetails />
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
          <ListGrid
            label={es ? 'Directorio de proveedores' : 'Supplier directory'}
            locale={locale}
            columns={[
              { key: 'name', label: es ? 'Proveedor' : 'Supplier' },
              { key: 'contact', label: es ? 'Contacto' : 'Contact', minWidth: 220 },
              { key: 'status', label: es ? 'Estado' : 'Status' },
              ...(canReadPurchases ? [{ key: 'purchases', label: es ? 'Compras abiertas' : 'Open purchase orders' }] : []),
            ]}
            rows={suppliers.map((supplier) => {
              const openCount = canReadPurchases ? workspace.drafts.filter(
                (draft) => draft.supplier_id === supplier.id
                  && purchaseProgress(draft, workspace.lines, workspace.receipts).open,
              ).length : 0;
              return {
                id: supplier.id,
                cells: {
                  name: { text: supplier.name, detailsId: `supplier-${supplier.id}` },
                  contact: { text: supplier.contact_name || '—', secondary: [supplier.email, supplier.phone].filter(Boolean).join('\n') },
                  status: { text: supplier.active ? activeLabel : inactiveLabel, badge: supplier.active ? 'default' as const : 'muted' as const },
                  ...(canReadPurchases ? {
                    purchases: { text: String(openCount), sortValue: openCount },
                  } : {}),
                },
              };
            })}
          />
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
