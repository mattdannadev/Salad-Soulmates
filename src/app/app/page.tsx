import Link from 'next/link';
import { ArrowUpRight, CalendarDays, Truck, Leaf, PackageCheck, ClipboardList } from 'lucide-react';
import loadDashboard from '@/lib/dashboard-data';
import DemandCoveragePanel from '@/components/demand-coverage-panel';
import DashboardPriorities, { type DashboardPriority } from '@/components/dashboard-priorities';
import DashboardQuickActions from '@/components/dashboard-quick-actions';
import DashboardSchedule from '@/components/dashboard-schedule';
import PickupReadiness, { type PickupReadinessData } from '@/components/pickup-readiness';
import WorkspaceSetup from '@/components/workspace-setup';
import loadWorkspaceSetup from '@/services/load-workspace-setup';
import { facilityDate, formatDate, formatNumber } from '@/domain/format';
import { purchaseStatusLabel } from '@/domain/supplier-orders';
import { createDashboardWorkQueues } from '@/services/dashboard-work-queues';
import { addScheduleDays } from '@/domain/scheduling';

const DASHBOARD_LIMIT = 6;

export default async function Home() {
  const [dashboard, setupSteps] = await Promise.all([loadDashboard(), loadWorkspaceSetup()]);
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
    purchases = incoming,
    suppliers,
    stock,
    production,
    canViewSchedule,
    upcomingSchedule = [],
  } = dashboard;
  const es = profile.preferred_locale === 'es';
  const today = facilityDate();
  const futurePickups = openOrders
    .filter((order) => order.needed_on > today)
    .toSorted((a, b) => a.needed_on.localeCompare(b.needed_on) || a.id.localeCompare(b.id));
  const activeOrdersLabel = es ? 'Pedidos activos de clientes' : 'Active customer orders';
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
  const shortages = coverage.filter((line) => line.shortage > 0).length;
  const unprepared = openOrders.filter(
    (order) => !production.some((plan) => plan.id === order.id && plan.status === 'Confirmed'),
  );
  const pickupReadiness: PickupReadinessData[] = futurePickups.slice(0, 3).map((order) => {
    const plan = production.find((candidate) => candidate.id === order.id && candidate.status === 'Confirmed');
    const hasIngredientShortage = coverage.some((line) => line.planId === order.id && line.shortage > 0);
    const inboundSupplyExpected = incoming.some((purchase) => purchase.material_plan_id === order.id);
    const scheduledCleaning = upcomingSchedule.find(
      (event) => event.kind === 'cleaning' && event.productionPlanId === order.id,
    );
    return {
      id: order.id,
      customerName: order.customer_name,
      orderReference: order.reference || order.id.slice(0, 8),
      pickupOn: order.needed_on,
      hasProductionPlan: Boolean(plan),
      hasIngredientShortage,
      inboundSupplyExpected,
      spicePrep: plan ? 'pending' : 'not_required',
      mixing: plan ? 'pending' : 'not_required',
      packaging: plan ? 'pending' : 'not_required',
      sanitation: scheduledCleaning?.employeeCount ? 'in_progress' : 'pending',
      pickup: !plan || hasIngredientShortage ? 'blocked' : 'pending',
      links: {
        order: `/app/orders?order=${order.id}`,
        productionPlan: `/app/orders?order=${order.id}`,
        ingredients: '#ingredient-demand',
        spicePrep: '/app/production',
        mixing: '/app/production',
        packaging: '/app/shipping',
        sanitation: '/app/scheduling',
      },
    };
  });
  const weeklyProductionPlans = production
    .filter((plan) => plan.status !== 'Cancelled' && plan.start_on <= addScheduleDays(today, 7))
    .map((plan) => {
      const order = openOrders.find((candidate) => candidate.id === plan.id);
      return {
        id: plan.id,
        customerName: order?.customer_name ?? (es ? 'Pedido de cliente' : 'Customer order'),
        reference: order?.reference || plan.id.slice(0, 8),
        startOn: plan.start_on,
        finishOn: plan.finish_on,
        pickupOn: order?.needed_on ?? plan.finish_on,
        status: plan.status,
      };
    })
    .filter((plan) => plan.finishOn >= today)
    .slice(0, DASHBOARD_LIMIT);
  const todayHandoffs = [
    ...upcomingSchedule
      .filter((event) => event.startOn <= today && event.endOn > today && event.kind !== 'off')
      .map((event) => ({
        id: `schedule-${event.id}`,
        title: event.title || (es ? 'Trabajo programado' : 'Scheduled work'),
        detail: event.assigneeNames.length
          ? event.assigneeNames.join(', ')
          : es ? 'Asignar a un miembro del equipo' : 'Assign a team member',
        href: '/app/scheduling',
        blocked: event.employeeCount === 0,
      })),
    ...(dueToday > 0 ? [{
      id: 'pickups',
      title: es ? 'Preparar recogidas de hoy' : 'Prepare today’s pickups',
      detail: `${dueToday} ${es ? 'pedido(s) vence(n) hoy' : 'order(s) due today'}`,
      href: '/app/orders?pickupTo=' + today,
      blocked: overdue > 0,
    }] : []),
    ...(shortages > 0 ? [{
      id: 'shortages',
      title: es ? 'Resolver faltantes antes de producir' : 'Resolve shortages before production',
      detail: `${shortages} ${es ? 'ingrediente(s) bloqueando demanda' : 'ingredient(s) blocking demand'}`,
      href: '#ingredient-demand',
      blocked: true,
    }] : []),
  ].slice(0, DASHBOARD_LIMIT);
  const priorities: DashboardPriority[] = createDashboardWorkQueues({
    today,
    canOrders: Boolean(canOrders),
    canOrderDirectory: Boolean(canCoverage),
    canPurchases: Boolean(canPurchases),
    canCoverage: Boolean(canCoverage),
    openOrders,
    purchases,
    coverage,
    production,
  }).map((queue) => {
    const definitions = {
      'pickups-due': {
        title: es ? 'Revisar recogidas pendientes' : 'Review pickups due',
        detail: `${dueToday} ${es ? 'para hoy' : 'due today'} · ${overdue} ${es ? 'con fecha vencida' : 'past pickup date'}`,
        icon: CalendarDays,
      },
      'purchases-unconfirmed': {
        title: es ? 'Revisar borradores de compra' : 'Review purchase drafts',
        detail: `${queue.count} ${es ? 'borradores pendientes de confirmación' : 'drafts awaiting confirmation'}`,
        icon: ClipboardList,
      },
      'deliveries-unreceived': {
        title: es ? 'Revisar entregas pendientes' : 'Review unreceived deliveries',
        detail: `${queue.count} ${es ? 'compras confirmadas pendientes de recibir' : 'confirmed purchases awaiting receipt'}`,
        icon: Truck,
      },
      'ingredient-shortages': {
        title: es ? 'Resolver faltantes de ingredientes' : 'Resolve ingredient shortages',
        detail: `${es ? 'Ingredientes sin cubrir la demanda' : 'Ingredients below demand'}: ${queue.count}`,
        icon: Leaf,
      },
      'planning-readiness': {
        title: es ? 'Revisar pedidos sin planificar' : 'Review unplanned orders',
        detail: `${es ? 'Pedidos sin un plan de producción' : 'Orders without a production plan'}: ${queue.count}`,
        icon: ClipboardList,
      },
    } as const;
    const definition = definitions[queue.id];
    return {
      id: queue.id,
      title: definition.title,
      detail: definition.detail,
      href: queue.href,
      icon: definition.icon,
      urgent: queue.overdueCount > 0,
    };
  });
  const metrics = [
    {
      title: es ? 'Recogidas hoy' : 'Pickups today',
      value: canOrders ? dueToday : '—',
      icon: CalendarDays,
      href: '/app/orders',
      available: canOrders,
      note: es ? 'Pedidos activos para hoy' : 'Active orders due today',
    },
    {
      title: es ? 'Pedidos abiertos' : 'Open orders',
      value: canOrders ? openOrders.length : '—',
      icon: ClipboardList,
      href: '/app/orders',
      available: canOrders,
      note: overdue
        ? `${overdue} ${es ? 'con fecha vencida' : 'past pickup date'}`
        : activeOrdersLabel,
    },
    {
      title: es ? 'Compras por recibir' : 'Purchases due in',
      value: canPurchases ? incoming.length : '—',
      icon: Truck,
      href: '/app/purchasing',
      available: canPurchases,
      note: es ? 'Confirmadas, aún pendientes' : 'Confirmed, not fully received',
    },
    {
      title: es ? 'Ingredientes con faltantes' : 'Ingredients short',
      value: shortages,
      icon: Leaf,
      href: '#ingredient-demand',
      available: canCoverage,
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
              ? 'Ve los compromisos, el equipo y los bloqueos de esta semana antes de profundizar.'
              : 'See this week’s commitments, team work, and blockers before you dive into the details.'}
          </p>
          <DashboardQuickActions es={es} />
        </div>
        <div className="dashboard-date">
          <Leaf size={28} />
          <span>{es ? 'FECHA DE OPERACIONES' : 'OPERATIONS DATE'}</span>
          <strong>{formatDate(today)}</strong>
          <small>America/Chicago</small>
        </div>
      </header>
      {canViewSchedule && (
        <div className="dashboard-primary-schedule">
          <DashboardSchedule events={upcomingSchedule} plans={weeklyProductionPlans} locale={profile.preferred_locale} />
        </div>
      )}
      {(canOrders || canPurchases || canCoverage) && (
        <DashboardPriorities items={priorities} es={es} />
      )}
      <div className="dashboard-metrics">
        {metrics
          .filter((metric) => metric.available)
          .map((metric) => (
            <Link className="dashboard-metric" href={metric.href} key={metric.title}>
              <metric.icon size={21} />
              <span>{metric.title}</span>
              <strong>{metric.value}</strong>
              <small>{metric.note}</small>
            </Link>
          ))}
      </div>

      <div className="dashboard-columns">
        {canOrders && pickupReadiness.length > 0 && (
          <section className="panel dashboard-readiness" aria-labelledby="pickup-readiness-heading">
            <div className="dashboard-panel-heading">
              <div>
                <p className="eyebrow">{es ? 'ESTADO DE PRODUCCIÓN' : 'PRODUCTION READINESS'}</p>
                <h2 id="pickup-readiness-heading">{es ? 'Próximas recogidas' : 'Next pickups'}</h2>
              </div>
              <PackageCheck size={24} aria-hidden />
            </div>
            <div className="dashboard-readiness-list">
              {pickupReadiness.map((pickup) => (
                <PickupReadiness key={pickup.id} pickup={pickup} locale={profile.preferred_locale} />
              ))}
            </div>
          </section>
        )}
        <section className="panel dashboard-handoffs" aria-labelledby="dashboard-handoffs-heading">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">{es ? 'RELEVOS DE HOY' : 'TODAY’S HANDOFFS'}</p>
              <h2 id="dashboard-handoffs-heading">{es ? 'Mover el trabajo adelante' : 'Keep work moving'}</h2>
            </div>
            <ArrowUpRight size={24} aria-hidden />
          </div>
          {todayHandoffs.length ? (
            <ul className="dashboard-handoff-list">
              {todayHandoffs.map((handoff) => (
                <li key={handoff.id} className={handoff.blocked ? 'is-blocked' : undefined}>
                  <Link href={handoff.href}>
                    <span>
                      <strong>{handoff.title}</strong>
                      <small>{handoff.detail}</small>
                    </span>
                    <ArrowUpRight size={16} aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : (
            <p className="muted-text">{es ? 'No hay relevos pendientes para hoy.' : 'No handoffs are waiting today.'}</p>
          )}
        </section>
        <section className="panel dashboard-pickups">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">{es ? 'PRÓXIMAS SALIDAS' : 'UP NEXT'}</p>
              <h2>{es ? 'Próximas recogidas' : 'Upcoming pickups'}</h2>
              <p className="dashboard-panel-description">
                {es ? 'Después de hoy, en orden de fecha.' : 'After today, earliest first.'}
              </p>
            </div>
            <CalendarDays size={24} />
          </div>
          {!canOrders && <p>{unavailable}</p>}
          {canOrders &&
            (!futurePickups.length ? (
              <div className="dashboard-empty">
                <CalendarDays size={30} />
                <h3>{es ? 'Sin recogidas futuras programadas' : 'No future pickups scheduled'}</h3>
                <p>
                  {es
                    ? 'Los pedidos con fechas futuras aparecerán aquí con productos y lotes.'
                    : 'Orders with future pickup dates appear here with dressing names and batch counts.'}
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
                      {`${formatNumber(order.items.reduce((sum, item) => sum + item.batch_count, 0))} ${es ? 'lotes en total' : 'total batches'}`}{' '}
                      <ArrowUpRight size={16} />
                    </span>
                  </Link>
                ))}
              </div>
            ))}
          <Link className="dashboard-footer-link" href="/app/orders">
            {es ? 'Ver todos los pedidos' : 'View all orders'} <ArrowUpRight size={16} />
          </Link>
        </section>
        <section className="panel" id="supplier-arrivals">
          <div className="dashboard-panel-heading">
            <div>
              <p className="eyebrow">{es ? 'ENTREGAS DE PROVEEDORES' : 'SUPPLIER ARRIVALS'}</p>
              <h2>{es ? 'Compras por recibir' : 'Waiting on suppliers'}</h2>
            </div>
            <Truck size={24} />
          </div>
          {!canPurchases && <p>{unavailable}</p>}
          {canPurchases &&
            (!incoming.length ? (
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
                        {suppliers.find((supplier) => supplier.id === purchase.supplier_id)?.name ??
                          purchase.reference}
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
            {es ? 'Ver compras' : 'View purchasing'} <ArrowUpRight size={16} />
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
          {canStock &&
            (!stock.length ? (
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
                          ? `${es ? 'Demanda abierta' : 'Open demand'}: ${formatNumber(ingredient.demand)} ${ingredient.inventory_uom}`
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
                        : `${formatNumber(ingredient.balance)} ${ingredient.inventory_uom}`}
                    </span>
                  </li>
                ))}
              </ul>
            ))}
          <Link className="dashboard-footer-link" href="/app/inventory">
            {es ? 'Revisar todo el inventario' : 'Review all inventory'} <ArrowUpRight size={16} />
          </Link>
        </section>
        <div className="dashboard-side-stack">
          <section className="panel dashboard-preparation" id="order-preparation">
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
                  {`${order.customer_name} · ${formatDate(order.needed_on)}`} →
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
      <WorkspaceSetup steps={setupSteps} es={es} />
    </div>
  );
}
