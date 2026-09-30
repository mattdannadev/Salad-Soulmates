import loadSupplierWorkspace from '@/lib/supplier-data';
import { purchaseProgress } from '@/domain/supplier-orders';
import { PageHeader } from '@/components/shell';
import { SupplierForm } from '@/components/master-forms';
import SupplierPurchases from '@/components/supplier-purchases';
import Link from 'next/link';
import ListGrid from '@/components/list-grid';
import SupplierDetailLink, { SupplierHashDetails } from '@/components/supplier-detail-link';
import { returnContextSearchParams } from '@/lib/return-context';
import { Suspense } from 'react';
import DirectoryToolbar from '@/components/directory-toolbar';
import {
  parseSupplierDirectoryQuery, supplierDirectoryFilters, supplierDirectorySorts,
  supplierCreateReturnHref, supplierDirectoryHref, type SupplierSearchParams,
} from './directory-query';
import SupplierReturnFocus from './supplier-return-focus';
import styles from './suppliers.module.css';

const PAGE_SIZE = 20;

export default async function Suppliers({
  searchParams,
}: {
  searchParams?: Promise<SupplierSearchParams>;
} = {}) {
  const rawQuery = await searchParams ?? {};
  const directoryQuery = parseSupplierDirectoryQuery(rawQuery);
  const workspace = await loadSupplierWorkspace();
  const {
    suppliers, locale, canEdit, canReadPurchases,
  } = workspace;
  const returnHref = supplierDirectoryHref(rawQuery, canReadPurchases);
  const addSupplierHref = `/app/suppliers/new?${returnContextSearchParams({
    href: supplierCreateReturnHref(rawQuery, canReadPurchases),
  })}`;
  const es = locale === 'es';
  const activeLabel = es ? 'Activo' : 'Active';
  const inactiveLabel = es ? 'Inactivo' : 'Inactive';
  const filters = supplierDirectoryFilters.map((filter) => ({
    ...filter,
    label: es ? 'Estado' : filter.label,
    options: filter.options.map((option) => ({
      ...option,
      label: option.value === 'active' ? activeLabel : inactiveLabel,
    })),
  }));
  const sortOptions = supplierDirectorySorts
    .filter((option) => canReadPurchases || option.value !== 'open-purchases')
    .map((option) => ({
      ...option,
      label: es ? ({
        name: 'Nombre A–Z',
        'name-desc': 'Nombre Z–A',
        'open-purchases': 'Más compras abiertas',
      })[option.value] : option.label,
    }));
  const suppliersWithPurchases = suppliers.map((supplier) => ({
    supplier,
    openCount: canReadPurchases ? workspace.drafts.filter(
      (draft) => draft.supplier_id === supplier.id
        && purchaseProgress(draft, workspace.lines, workspace.receipts).open,
    ).length : 0,
  }));
  const filteredSuppliers = suppliersWithPurchases
    .filter(({ supplier }) => {
      const q = directoryQuery.q.toLocaleLowerCase(locale);
      return !q || [supplier.name, supplier.contact_name, supplier.email, supplier.phone]
        .some((value) => value?.toLocaleLowerCase(locale).includes(q));
    })
    .filter(({ supplier }) => !directoryQuery.status
      || supplier.active === (directoryQuery.status === 'active'))
    .sort((left, right) => {
      if (directoryQuery.sort === 'open-purchases' && canReadPurchases) {
        const countOrder = right.openCount - left.openCount;
        if (countOrder !== 0) return countOrder;
      }
      const nameOrder = left.supplier.name.localeCompare(right.supplier.name, locale);
      return directoryQuery.sort === 'name-desc' ? -nameOrder : nameOrder;
    });
  const pageCount = Math.max(1, Math.ceil(filteredSuppliers.length / PAGE_SIZE));
  const visibleSuppliers = filteredSuppliers.slice(
    (directoryQuery.page - 1) * PAGE_SIZE,
    directoryQuery.page * PAGE_SIZE,
  );
  let emptyDescription = es
    ? 'Ajusta los filtros para encontrar un proveedor.'
    : 'Adjust the filters to find a supplier.';
  if (directoryQuery.page > pageCount) {
    emptyDescription = es
      ? 'Esta página ya no tiene resultados.' : 'This page no longer has results.';
  }
  return (
    <>
      <PageHeader
        eyebrow={es ? 'NUESTROS PROVEEDORES' : 'OUR PARTNERS'}
        title={es ? 'Proveedores' : 'Suppliers'}
        action={
          canEdit && (
            <Link className="button" href={addSupplierHref}>
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
        <SupplierReturnFocus
          filteredSupplierIds={filteredSuppliers.map(({ supplier }) => supplier.id)}
          allSupplierIds={suppliers.map((supplier) => supplier.id)}
          page={directoryQuery.page}
          pageSize={PAGE_SIZE}
          locale={locale}
        />
        <h2>{es ? 'Tus proveedores' : 'Your suppliers'}</h2>
        <Suspense fallback={null}>
          <DirectoryToolbar
            label={es ? 'Filtros de proveedores' : 'Supplier filters'}
            resultCount={filteredSuppliers.length}
            filters={filters}
            sortOptions={sortOptions}
            locale={locale}
            mobileFilters
            pageCount={pageCount}
          />
        </Suspense>
        {!suppliers.length && (
          <div className="empty">
            <h3>{es ? 'Aún no hay proveedores' : 'No suppliers yet'}</h3>
            <p>
              {es
                ? 'Agrega un proveedor y configura sus presentaciones en cada ingrediente.'
                : 'Add a supplier, then connect their packs from an ingredient’s detail page.'}
            </p>
            {canEdit && <Link href={addSupplierHref}>{es ? 'Crear proveedor' : 'Create supplier'}</Link>}
          </div>
        )}
        {!!suppliers.length && !visibleSuppliers.length && (
          <div className="empty">
            <h3>{es ? 'No hay proveedores en esta vista' : 'No suppliers in this view'}</h3>
            <p>{emptyDescription}</p>
            <Link href="/app/suppliers">{es ? 'Borrar filtros' : 'Clear all'}</Link>
          </div>
        )}
        {!!visibleSuppliers.length && (
          <div className={styles.desktopDirectory}>
            <ListGrid
              label={es ? 'Directorio de proveedores' : 'Supplier directory'}
              locale={locale}
              columns={[
                { key: 'name', label: es ? 'Proveedor' : 'Supplier' },
                { key: 'contact', label: es ? 'Contacto' : 'Contact', minWidth: 220 },
                ...(canReadPurchases ? [{ key: 'purchases', label: es ? 'Compras abiertas' : 'Open purchase orders' }] : []),
              ]}
              searchable={false}
              controlled={{
                page: directoryQuery.page,
                pageSize: PAGE_SIZE,
                totalCount: filteredSuppliers.length,
                sort: directoryQuery.sort === 'open-purchases'
                  ? { key: 'purchases', direction: 'desc' }
                  : { key: 'name', direction: directoryQuery.sort === 'name-desc' ? 'desc' : 'asc' },
              }}
              rows={visibleSuppliers.map(({ supplier, openCount }) => ({
                id: supplier.id,
                cells: {
                  name: { text: supplier.name, detailsId: `supplier-${supplier.id}` },
                  contact: { text: supplier.contact_name || '—', secondary: [supplier.email, supplier.phone].filter(Boolean).join('\n') },
                  ...(canReadPurchases ? {
                    purchases: { text: String(openCount), sortValue: openCount },
                  } : {}),
                },
              }))}
            />
          </div>
        )}
        {!!visibleSuppliers.length && (
          <div className={styles.mobileDirectory} role="region" aria-label={es ? 'Directorio de proveedores' : 'Supplier directory'}>
            {visibleSuppliers.map(({ supplier, openCount }) => (
              <div
                className={styles.supplierCard}
                key={supplier.id}
              >
                <SupplierDetailLink supplierId={supplier.id} supplierName={supplier.name} />
                <span>{[supplier.contact_name, supplier.email, supplier.phone].filter(Boolean).join(' · ')}</span>
                {canReadPurchases && <span>{`${openCount} ${es ? 'compras abiertas' : 'open purchase orders'}`}</span>}
              </div>
            ))}
          </div>
        )}
        {visibleSuppliers.map(({ supplier }) => (
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
                <SupplierForm
                  supplier={supplier}
                  returnHref={returnHref}
                  locale={locale}
                />
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
