import Link from 'next/link';
import {
  ArrowUpRight, CalendarDays, Truck, Leaf, PackageCheck, ClipboardList,
} from 'lucide-react';
import loadDashboard from '@/lib/dashboard-data';
import DemandCoveragePanel from '@/components/demand-coverage-panel';
import { facilityDate, formatDate, formatNumber } from '@/domain/format';
import { purchaseStatusLabel } from '@/domain/supplier-orders';

const DASHBOARD_LIMIT = 6;

export default async function Home() {
  const {
    profile,
    canOrders,
    canPurchases,
    canStock,
    canCoverage,
    canGeneratePurchases,
    coverage,
    openOrders,
    incoming,
    suppliers,
    stock,
    production,
  } = await loadDashboard();
  const es = profile.preferred_locale === 'es';
  const today = facilityDate();
  const futurePickups = openOrders.filter((order) => order.needed_on > today)
    .toSorted((a, b) => a.needed_on.localeCompare(b.needed_on) || a.id.localeCompare(b.id));
  const upcomingLabel = es ? 'Próximas recogidas' : 'Upcoming customer pickups';
  const lateLabel = es ? 'Fecha vencida' : 'Past pickup date';
  const todayLabel = es ? 'Hoy' : 'Today';
  const overdueLabel = es ? 'Atrasada' : 'Overdue';
  const inventoryLabel = es ? 'Inventario de ingredientes' : 'Ingredient inventory';
  const unrecordedLabel = es ? 'Sin registrar' : 'Not recorded';
  function pickupLabel(date: string) {
    if (date < today) return lateLabel;
    if (date === today) return todayLabel;
    return formatDate(date);
  }
  const overdue = openOrders.filter((order) => order.needed_on < today).length;
  const dueToday = openOrders.filter((order) => order.needed_on === today).length;

  const unprepared = openOrders.filter(
    (order) => !production.some((plan) => plan.id === order.id && plan.status === 'Confirmed'),
  );
  const metrics = [
    {
      title: es ? 'Recogidas hoy' : 'Pickups today',
      value: canOrders ? dueToday : '—',
      icon: CalendarDays,
      href: '/app/orders',
      note: es ? 'Pedidos activos para hoy' : 'Active orders due today',
    },
    {
      title: es ? 'Pedidos abiertos' : 'Open orders',
      value: canOrders ? openOrders.length : '—',
      icon: ClipboardList,
      href: '/app/orders',
      note: overdue
        ? `${overdue} ${es ? 'con fecha vencida' : 'past pickup date'}`
        : upcomingLabel,
    },
    {
      title: es ? 'Compras por recibir' : 'Purchases due in',
      value: canPurchases ? incoming.length : '—',
      icon: Truck,
      href: '/app/purchasing',
      note: es ? 'Confirmadas, aún pendientes' : 'Confirmed, not fully received',
    },
    {
      title: es ? 'Ingredientes con faltantes' : 'Ingredients short',
      value: canCoverage ? coverage.filter((line) => line.shortage > 0).length : '—',
      icon: Leaf,
      href: '#ingredient-demand',
      note: es ? 'Demanda abierta frente a disponibilidad' : 'Open demand versus usable supply',
    },
  ];
  const unavailable = es
    ? 'No tienes acceso a estos registros.'
    : 'You do not have access to these records.';
  return (
    <div className="operations-dashboard">
      <header className="dashboard-hero">
        <div>
          <p className="eyebrow">{es ? 'EL DÍA EN PRODUCCIÓN' : 'THE DAY AT A GLANCE'}</p>
          <h1>{`${es ? 'Bienvenido' : 'Welcome'}, ${profile.display_name.split(' ')[0]}`}</h1>
          <p>
            {es
              ? 'Tus pedidos, entregas e ingredientes. Todo lo que necesita atención, en un solo lugar.'
              : 'Your orders, arrivals, and ingredients. A clear view of what needs attention.'}
          </p>
          <div className="dashboard-quick-links">
            <Link className="button" href="/app/orders#new-order">
              {es ? '+ Nuevo pedido' : '+ New order'}
            </Link>
            <Link href="/app/receiving">
              {es ? 'Registrar recepción' : 'Receive a delivery'}
              {' '}
              <ArrowUpRight size={16} />
            </Link>
          </div>
        </div>
        <div className="dashboard-date">
          <Leaf size={28} />
          <span>{es ? 'FECHA DE OPERACIONES' : 'OPERATIONS DATE'}</span>
          <strong>{formatDate(today)}</strong>
          <small>America/Chicago</small>
        </div>
      </header>
      <div className="dashboard-metrics">
        {metrics.map((metric) => (
          <Link className="dashboard-metric" href={metric.href} key={metric.title}>
            <metric.icon size={21} />
            <span>{metric.title}</span>
            <strong>{metric.value}</strong>
            <small>{metric.note}</small>
          </Link>
        ))}
      </div>

      <div className="dashboard-columns">
        <section className="panel dashboard-pickups">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">{es ? 'PRÓXIMAS SALIDAS' : 'UP NEXT'}</p>
              <h2>{es ? 'Próximas recogidas' : 'Upcoming pickups'}</h2>
            </div>
            <CalendarDays size={24} />
          </div>
          {!canOrders && <p>{unavailable}</p>}
          {canOrders && (!futurePickups.length ? (
            <div className="dashboard-empty">
              <CalendarDays size={30} />
              <h3>{es ? 'Sin recogidas pendientes' : 'No pickups on the board'}</h3>
              <p>
                {es
                  ? 'Los pedidos nuevos aparecerán aquí con productos, lotes y fechas.'
                  : 'New orders appear here with dressing names, batch counts, and pickup dates.'}
              </p>
              <Link href="/app/orders#new-order">
                {es ? 'Preparar un pedido →' : 'Prepare an order →'}
              </Link>
            </div>
          ) : (
            <div className="dashboard-order-list">
              {futurePickups.map((order) => (
                <Link
                  className="dashboard-order"
                  href={`/app/orders?order=${order.id}`}
                  key={order.id}
                >
                  <div className="dashboard-order-heading">
                    <strong>{order.customer_name}</strong>
                    <span className={`badge ${order.needed_on < today ? 'warning' : ''}`}>
                      {pickupLabel(order.needed_on)}
                    </span>
                  </div>
                  <small>{`${order.reference || order.id.slice(0, 8)} · ${es ? 'Recogida' : 'Pickup'} ${formatDate(order.needed_on)}`}</small>
                  <ul className="dashboard-products">
                    {order.items.map((item) => (
                      <li key={item.product_id}>
                        <span>{item.product_name}</span>
                        <strong>{`${formatNumber(item.batch_count)} ${es ? 'lotes' : 'batches'}`}</strong>
                      </li>
                    ))}
                  </ul>
                  <span className="dashboard-order-total">
                    {`${formatNumber(order.items.reduce((sum, item) => sum + item.batch_count, 0))} ${es ? 'lotes en total' : 'total batches'}`}
                    {' '}
                    <ArrowUpRight size={16} />
                  </span>
                </Link>
              ))}
            </div>
          ))}
          <Link className="dashboard-footer-link" href="/app/orders">
            {es ? 'Ver todos los pedidos' : 'View all orders'}
            {' '}
            <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="panel">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">{es ? 'ENTREGAS DE PROVEEDORES' : 'SUPPLIER ARRIVALS'}</p>
              <h2>{es ? 'Compras por recibir' : 'Waiting on suppliers'}</h2>
            </div>
            <Truck size={24} />
          </div>
          {!canPurchases && <p>{unavailable}</p>}
          {canPurchases && (!incoming.length ? (
            <div className="dashboard-empty">
              <Truck size={30} />
              <h3>{es ? 'Sin entregas pendientes' : 'No deliveries outstanding'}</h3>
              <p>
                {es
                  ? 'Las compras confirmadas permanecen aquí hasta su recepción completa.'
                  : 'Confirmed purchases stay here until every line is received.'}
              </p>
            </div>
          ) : (
            <div className="dashboard-order-list">
              {incoming.slice(0, DASHBOARD_LIMIT).map((purchase) => (
                <Link
                  className="dashboard-order"
                  href={`/app/purchasing?plan=${purchase.material_plan_id}&supplier=${purchase.supplier_id}`}
                  key={purchase.id}
                >
                  <div className="dashboard-order-heading">
                    <strong>
                      {suppliers.find((supplier) => supplier.id === purchase.supplier_id)?.name
                        ?? purchase.reference}
                    </strong>
                    <span className={`badge ${purchase.expected_on < today ? 'warning' : ''}`}>
                      {purchase.expected_on < today
                        ? overdueLabel
                        : purchaseStatusLabel(purchase.progress.status, profile.preferred_locale)}
                    </span>
                  </div>
                  <small>{`${purchase.reference} · ${es ? 'Entrega prevista' : 'Expected'} ${formatDate(purchase.expected_on)}`}</small>
                  <ul className="dashboard-products">
                    {purchase.progress.balances
                      .filter((balance) => balance.remaining > 0)
                      .map((balance) => (
                        <li key={balance.line.id}>
                          <span>{balance.line.ingredient_name}</span>
                          <strong>{`${formatNumber(balance.remaining)} ${balance.line.uom}`}</strong>
                        </li>
                      ))}
                  </ul>
                </Link>
              ))}
            </div>
          ))}
          <Link className="dashboard-footer-link" href="/app/purchasing">
            {es ? 'Ver compras' : 'View purchasing'}
            {' '}
            <ArrowUpRight size={16} />
          </Link>
        </section>
        {canCoverage && (
          <DemandCoveragePanel coverage={coverage} es={es} canGenerate={canGeneratePurchases} />
        )}
        <section className="panel">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">{es ? 'DESPENSA DE PRODUCCIÓN' : 'PRODUCTION PANTRY'}</p>
              <h2>{es ? 'Ingredientes clave' : 'Key ingredients'}</h2>
            </div>
            <Leaf size={24} />
          </div>
          <p className="muted-text">
            {es
              ? 'Primero los ingredientes de pedidos abiertos. Existencias propias, incluidas retenciones; no equivale a material disponible.'
              : 'Ingredients for open orders come first. Owned stock includes held material; it is not production availability.'}
          </p>
          {!canStock && <p>{unavailable}</p>}
          {canStock && (!stock.length ? (
            <p className="empty">
              {es ? 'Aún no hay ingredientes.' : 'No ingredients recorded yet.'}
            </p>
          ) : (
            <ul className="dashboard-stock">
              {stock.slice(0, DASHBOARD_LIMIT).map((ingredient) => (
                <li key={ingredient.id}>
                  <Link href={`/app/ingredients/${ingredient.id}`}>
                    <strong>{ingredient.name}</strong>
                    <small>
                      {ingredient.demand > 0
                        ? `${es ? 'Demanda abierta' : 'Open demand'}: ${formatNumber(ingredient.demand)} ${ingredient.default_uom}`
                        : inventoryLabel}
                    </small>
                  </Link>
                  <span
                    className={
                      ingredient.balance !== null && ingredient.balance <= 0
                        ? 'stock-attention'
                        : ''
                    }
                  >
                    {ingredient.balance === null
                      ? unrecordedLabel
                      : `${formatNumber(ingredient.balance)} ${ingredient.default_uom}`}
                  </span>
                </li>
              ))}
            </ul>
          ))}
          <Link className="dashboard-footer-link" href="/app/inventory">
            {es ? 'Revisar todo el inventario' : 'Review all inventory'}
            {' '}
            <ArrowUpRight size={16} />
          </Link>
        </section>
        <div className="dashboard-side-stack">
          <section className="panel dashboard-preparation">
            <ClipboardList size={24} />
            <p className="eyebrow">{es ? 'ANTES DE PRODUCIR' : 'BEFORE PRODUCTION'}</p>
            <h2>{es ? 'Preparación de pedidos' : 'Order preparation'}</h2>
            <p>
              {canOrders
                ? `${unprepared.length} ${es ? 'pedidos abiertos sin preparación confirmada.' : 'open orders still need confirmed production preparation.'}`
                : unavailable}
            </p>
            {unprepared.slice(0, 3).map((order) => (
              <p key={order.id}>
                <Link href={`/app/orders?order=${order.id}`}>
                  {`${order.customer_name} · ${formatDate(order.needed_on)}`}
                  {' '}
                  →
                </Link>
              </p>
            ))}
          </section>
          <section className="panel">
            <div className="dashboard-panel-heading">
              <h2>{es ? 'Envíos recientes' : 'Recently shipped'}</h2>
              <PackageCheck size={24} />
            </div>
            <p className="muted-text">
              {es
                ? 'La confirmación de entregas aún no está disponible. Aquí aparecerán los envíos reales, con productos y lotes; los borradores no cuentan como enviados.'
                : 'Shipment confirmation is not available yet. Completed shipments will appear here with products and batch counts; preparation drafts are not shipments.'}
            </p>
            <Link href="/app/shipping">
              {es ? 'Ver preparación de envíos →' : 'View shipping preparation →'}
            </Link>
          </section>
        </div>
      </div>
    </div>
  );
}
