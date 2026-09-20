import loadSupplierWorkspace from '@/lib/supplier-data';
import { purchaseProgress } from '@/domain/supplier-orders';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';
import SupplierPurchases from '@/components/supplier-purchases';

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
        description={es
          ? 'Consulta compras, entregas previstas y los pedidos de clientes relacionados.'
          : 'Track purchase orders, expected deliveries and the customer orders they support.'}
      />
      <section className="panel">
        <h2>{es ? 'Tus proveedores' : 'Your suppliers'}</h2>
        {!suppliers.length && (
          <div className="empty">
            <h3>{es ? 'Aún no hay proveedores' : 'No suppliers yet'}</h3>
            <p>{es ? 'Agrega un proveedor y configura sus presentaciones en cada ingrediente.' : 'Add a supplier, then connect their packs from an ingredient’s detail page.'}</p>
          </div>
        )}
        {suppliers.map((supplier) => {
          const openCount = workspace.drafts.filter((draft) => draft.supplier_id === supplier.id
            && purchaseProgress(draft, workspace.lines, workspace.receipts).open).length;
          return (
            <details className="supplier-orders" key={supplier.id}>
              <summary>
                <strong>{supplier.name}</strong>
                <span className="badge">{supplier.active ? activeLabel : inactiveLabel}</span>
                {canReadPurchases && <span className="supplier-order-count">{`${es ? 'Compras abiertas' : 'Open purchase orders'}: ${openCount}`}</span>}
              </summary>
              <SupplierPurchases supplier={supplier} workspace={workspace} />
              <details className="supplier-profile">
                <summary>{es ? 'Contacto y configuración' : 'Supplier contact & settings'}</summary>
                {canEdit ? <SupplierForm supplier={supplier} /> : (
                  <p>{`${supplier.contact_name} · ${supplier.email || (es ? 'Sin correo' : 'No email')} · ${supplier.phone || (es ? 'Sin teléfono' : 'No phone')} · ${supplier.lead_time_days ?? 0} ${es ? 'días' : 'days'}`}</p>
                )}
              </details>
            </details>
          );
        })}
      </section>
      {canEdit && (
        <details className="panel">
          <summary>{es ? 'Agregar proveedor' : 'Add supplier'}</summary>
          <SupplierForm />
        </details>
      )}
    </>
  );
}
