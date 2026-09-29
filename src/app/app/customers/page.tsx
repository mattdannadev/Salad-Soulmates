import Link from 'next/link';
import { notFound, redirect } from 'next/navigation';
import { z } from 'zod';
import { Suspense } from 'react';
import { PageHeader } from '@/components/shell';
import CustomerForm from '@/components/customer-form';
import loadCustomerWorkspace from '@/lib/customer-data';
import { formatDate } from '@/domain/format';
import { formatPrice } from '@/domain/customer-pricing';
import ListGrid from '@/components/list-grid';
import DirectoryToolbar from '@/components/directory-toolbar';
import {
  customerDirectoryConfig, customerDirectorySearchParams, customerDirectoryView,
} from './customer-directory';
import CustomerCreateLink from './customer-create-link';
import CustomerFocus from './customer-focus';
import { customerDirectoryHref, customerReturnContext, customerReturnHref } from './return-context';

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const query = z.object({ customer: z.uuid().optional() }).safeParse(params);
  if (!query.success) notFound();
  const directoryHref = customerDirectoryHref(params);
  const origin = customerReturnContext(directoryHref, params.focusRow);
  const focusRow = z.uuid().safeParse(params.focusRow);
  const workspace = await loadCustomerWorkspace();
  const {
    customers, orders, plans, options, products, locale, canEdit, canReadOrders,
  } = workspace;
  const es = locale === 'es';
  const selected = customers.find((customer) => customer.id === query.data.customer);
  if (query.data.customer && !selected) notFound();
  const activePlanIds = new Set(plans.filter((plan) => plan.status === 'Active')
    .map((plan) => plan.id));
  const openOrders = orders.filter((order) => activePlanIds.has(order.id));
  const directoryConfig = customerDirectoryConfig(locale, canReadOrders);
  const directoryParams = customerDirectorySearchParams(params);
  const directory = customerDirectoryView(
    customers,
    openOrders,
    canReadOrders,
    directoryParams,
    directoryConfig,
    focusRow.success ? focusRow.data : undefined,
  );
  const canonicalParams = new URLSearchParams(directoryParams);
  ['q', 'activity', 'sort', 'page'].forEach((key) => canonicalParams.delete(key));
  if (directory.query.q) canonicalParams.set('q', directory.query.q);
  if (directory.query.filters.activity) canonicalParams.set('activity', directory.query.filters.activity);
  if (directory.query.sort) canonicalParams.set('sort', directory.query.sort);
  const targetPage = directory.focusPage ?? directory.page;
  if (targetPage > 1) canonicalParams.set('page', String(targetPage));
  if (directoryParams.toString() !== canonicalParams.toString()) {
    redirect(`/app/customers?${canonicalParams}`);
  }
  const clearParams = new URLSearchParams(canonicalParams);
  ['q', 'activity', 'sort', 'page'].forEach((key) => clearParams.delete(key));
  const clearHref = `/app/customers${clearParams.size ? `?${clearParams}` : ''}`;
  const hasCriteria = Boolean(directory.query.q
    || directory.query.filters.activity || directory.query.sort);
  const focusedCustomer = focusRow.success
    ? customers.find((customer) => customer.id === focusRow.data) : undefined;
  const focusIsVisible = directory.focusPage === directory.page;
  let sortKey = 'name';
  if (directory.query.sort === 'orders-desc') sortKey = 'orders';
  if (directory.query.sort === 'pickup-asc') sortKey = 'pickup';
  const sortDirection = directory.query.sort === 'name-desc'
    || directory.query.sort === 'orders-desc' ? 'desc' : 'asc';
  return (
    <>
      <PageHeader
        eyebrow={es ? 'RELACIONES' : 'OUR CUSTOMERS'}
        title={es ? 'Clientes' : 'Customers'}
        description={
          es
            ? 'Contactos, precios y pedidos abiertos por fecha de recogida.'
            : 'Contacts, agreed prices, and open orders by pickup date.'
        }
        action={
          canEdit && customers.length > 0 && (
            <CustomerCreateLink
              label={es ? '+ Agregar cliente' : '+ Add customer'}
              directoryHref={directoryHref}
            />
          )
        }
      />
      <section className="panel">
        {focusIsVisible && focusRow.success && <CustomerFocus rowId={focusRow.data} />}
        <Suspense fallback={null}>
          <DirectoryToolbar
            label={es ? 'Buscar y filtrar clientes' : 'Search and filter customers'}
            locale={locale}
            resultCount={directory.resultCount}
            filters={directoryConfig.filters}
            sortOptions={directoryConfig.sortOptions}
            pageCount={directory.pageCount}
            mobileFilters
          />
        </Suspense>
        {focusedCustomer && !focusIsVisible && (
          <p role="status">
            {es
              ? `El cliente guardado, ${focusedCustomer.name}, está fuera de esta vista. `
              : `The saved customer, ${focusedCustomer.name}, is outside this view. `}
            <Link href={clearHref}>{es ? 'Borrar filtros para encontrarlo' : 'Clear filters to find it'}</Link>
          </p>
        )}
        {directory.resultCount > 0 && (
        <ListGrid
          label={es ? 'Directorio de clientes' : 'Customer directory'}
          locale={locale}
          searchable={false}
          controlled={{
            page: directory.page,
            pageSize: directory.pageSize,
            totalCount: directory.resultCount,
            sort: { key: sortKey, direction: sortDirection },
          }}
          focusRowId={focusIsVisible && focusRow.success ? focusRow.data : undefined}
          columns={[
            {
              key: 'name', label: es ? 'Cliente' : 'Customer', sortable: false, filterable: false,
            },
            {
              key: 'contact', label: es ? 'Contacto' : 'Contact', minWidth: 220, sortable: false, filterable: false,
            },
            {
              key: 'orders', label: es ? 'Pedidos abiertos' : 'Open orders', sortable: false, filterable: false,
            },
            {
              key: 'pickup', label: es ? 'Próxima recogida' : 'Next pickup', sortable: false, filterable: false,
            },
            {
              key: 'action', label: es ? 'Acciones' : 'Actions', sortable: false, filterable: false,
            },
          ]}
          rows={directory.customers.map((customer) => {
            const own = (directory.ordersByCustomer.get(customer.id) ?? [])
              .toSorted((a, b) => a.needed_on.localeCompare(b.needed_on));
            return {
              id: customer.id,
              cells: {
                name: { text: customer.name, href: customerReturnHref(origin, customer.id) },
                contact: { text: customer.contact_name || '—', secondary: [customer.email, customer.phone].filter(Boolean).join('\n') },
                orders: { text: canReadOrders ? String(own.length) : '—', sortValue: canReadOrders ? own.length : -1 },
                pickup: { text: own[0] ? formatDate(own[0].needed_on) : '—', sortValue: own[0]?.needed_on ?? '' },
                action: {
                  text: es ? 'Seleccionar para pedido →' : 'Select for order →',
                  href: `/app/orders?customer=${customer.id}#new-order`,
                },
              },
            };
          })}
        />
        )}
        {customers.length === 0 && (
          <div className="empty">
            <p>{es ? 'Aún no hay clientes. Crea uno para registrar sus datos y preparar pedidos.' : 'No customers yet. Create one to keep contact details and prepare orders.'}</p>
            {canEdit && <CustomerCreateLink label={es ? 'Crear cliente' : 'Create customer'} directoryHref={directoryHref} />}
            {!canEdit && <p>{es ? 'Pide a un administrador que agregue el primer cliente.' : 'Ask an administrator to add the first customer.'}</p>}
          </div>
        )}
        {customers.length > 0 && directory.resultCount === 0 && (
          <div className="empty">
            <p>{es ? 'Ningún cliente coincide con los criterios actuales.' : 'No customers match the current criteria.'}</p>
            {hasCriteria && <Link href={clearHref}>{es ? 'Borrar todos los filtros' : 'Clear all filters'}</Link>}
          </div>
        )}
      </section>
      {selected && (
        <section className="panel">
          <h2>{selected.name}</h2>
          <p>
            <Link className="button" href={`/app/orders?customer=${selected.id}#new-order`}>
              {es ? 'Nuevo pedido' : 'New order'}
            </Link>
          </p>
          <h3>{es ? 'Pedidos abiertos' : 'Open orders'}</h3>
          {!canReadOrders ? (
            <p>{es ? 'Sin permiso para consultar pedidos.' : 'Order access is unavailable.'}</p>
          ) : (
            <>
              {!openOrders.some((order) => order.customer_id === selected.id) && (
                <p>{es ? 'No hay pedidos abiertos.' : 'No open orders.'}</p>
              )}
              <div className="worksheet-links">
                {openOrders
                  .filter((order) => order.customer_id === selected.id)
                  .toSorted((a, b) => a.needed_on.localeCompare(b.needed_on))
                  .map((order) => (
                    <Link
                      className="worksheet-link"
                      key={order.id}
                      href={`/app/orders?order=${order.id}`}
                    >
                      <strong>{order.reference || order.id.slice(0, 8)}</strong>
                      <span>{`${es ? 'Creado' : 'Ordered'} ${formatDate(order.created_at)}`}</span>
                      <span>{`${es ? 'Recogida' : 'Pickup'} ${formatDate(order.needed_on)}`}</span>
                    </Link>
                  ))}
              </div>
            </>
          )}
          <h3>{es ? 'Precios por producto y empaque' : 'Product & package pricing'}</h3>
          {options
            .filter((option) => option.customer_id === selected.id && option.active)
            .map((option) => (
              <p
                key={option.id}
              >
                {`${products.find((product) => product.id === option.product_id)?.name ?? ''} · ${option.label} · ${option.gallons_per_unit} gal / ${option.unit_name} · ${formatPrice(option.unit_price)} / ${option.unit_name}`}
              </p>
            ))}
          {workspace.canReadPrices && (
            <p>
              <Link href="/app/products">
                {es ? 'Administrar precios en Productos →' : 'Manage customer prices in Products →'}
              </Link>
            </p>
          )}
          <h3>{es ? 'Datos del cliente' : 'Customer details'}</h3>
          {canEdit ? (
            <CustomerForm
              key={`${selected.id}-${selected.revision}`}
              customer={selected}
              locale={locale}
              returnContext={origin}
            />
          ) : (
            <p>
              {[
                selected.contact_name,
                selected.email,
                selected.phone,
                selected.address,
                selected.notes,
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          )}
        </section>
      )}
    </>
  );
}
