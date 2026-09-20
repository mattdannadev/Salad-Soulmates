import Link from 'next/link';
import { notFound } from 'next/navigation';
import { z } from 'zod';
import { PageHeader } from '@/components/shell';
import CustomerForm from '@/components/customer-form';
import loadCustomerWorkspace from '@/lib/customer-data';
import { formatDate } from '@/domain/format';
import { formatPrice } from '@/domain/customer-pricing';

export default async function Customers({
  searchParams,
}: {
  searchParams: Promise<{ customer?: string }>;
}) {
  const query = z.object({ customer: z.uuid().optional() }).safeParse(await searchParams);
  if (!query.success) notFound();
  const workspace = await loadCustomerWorkspace();
  const {
    customers, orders, plans, options, products, locale, canEdit, canReadOrders,
  } = workspace;
  const es = locale === 'es';
  const selected = customers.find((customer) => customer.id === query.data.customer);
  if (query.data.customer && !selected) notFound();
  const openOrders = orders.filter((order) => plans.some((plan) => plan.id === order.id && plan.status === 'Active'));
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
          canEdit && (
            <Link className="button" href="/app/customers/new">
              {es ? '+ Agregar cliente' : '+ Add customer'}
            </Link>
          )
        }
      />
      <section className="panel">
        <div className="table-wrap">
          <table aria-label={es ? 'Directorio de clientes' : 'Customer directory'}>
            <thead>
              <tr>
                {(es
                  ? ['Cliente', 'Contacto', 'Pedidos abiertos', 'Próxima recogida', '']
                  : ['Customer', 'Contact', 'Open orders', 'Next pickup', '']
                ).map((heading, index) => (
                  <th key={heading || 'actions'} scope="col">
                    {index === 4 ? (
                      <span className="sr-only">{es ? 'Acciones' : 'Actions'}</span>
                    ) : (
                      heading
                    )}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {customers
                .toSorted((a, b) => a.name.localeCompare(b.name))
                .map((customer) => {
                  const own = openOrders
                    .filter((order) => order.customer_id === customer.id)
                    .toSorted((a, b) => a.needed_on.localeCompare(b.needed_on));
                  return (
                    <tr key={customer.id}>
                      <td>
                        <Link href={`/app/customers?customer=${customer.id}`}>{customer.name}</Link>
                      </td>
                      <td>
                        {customer.contact_name || '—'}
                        <br />
                        {customer.email}
                        <br />
                        {customer.phone}
                      </td>
                      <td>{canReadOrders ? own.length : '—'}</td>
                      <td>{own[0] ? formatDate(own[0].needed_on) : '—'}</td>
                      <td>
                        <Link href={`/app/orders?customer=${customer.id}#new-order`}>
                          {es ? 'Seleccionar para pedido →' : 'Select for order →'}
                        </Link>
                      </td>
                    </tr>
                  );
                })}
            </tbody>
          </table>
        </div>
        {!customers.length && (
          <p className="empty">{es ? 'Aún no hay clientes.' : 'No customers yet.'}</p>
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
