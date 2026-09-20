import Link from 'next/link';
import { Leaf } from 'lucide-react';
import type { DemandCoverage } from '@/domain/demand-coverage';
import { formatDate, formatNumber } from '@/domain/format';
import DemandPurchaseButton from './demand-purchase-button';

export default function DemandCoveragePanel({ coverage, es, canGenerate }: {
  coverage: DemandCoverage[]; es: boolean; canGenerate: boolean;
}) {
  const shortages = coverage.filter((line) => line.shortage > 0).length;
  const shortLabel = es ? 'Comprar' : 'To order';
  const coveredLabel = es ? 'Cubierto' : 'Covered';
  return (
    <section className="panel dashboard-demand" id="ingredient-demand">
      <div className="dashboard-panel-heading">
        <div>
          <p className="eyebrow">{es ? 'LISTOS PARA PRODUCIR' : 'READY TO MAKE'}</p>
          <h2>{es ? 'Ingredientes para pedidos abiertos' : 'Ingredients for open orders'}</h2>
        </div>
        <Leaf size={24} />
      </div>
      <p>
        {es
          ? 'Demanda acumulada por fecha de producción o recogida. Las compras confirmadas cuentan solo si llegan a tiempo. Los borradores no son existencias.'
          : 'Demand is accumulated by production or pickup date. Confirmed purchases count only when due in time. Drafts do not count as supply.'}
      </p>
      <div className="demand-summary">
        <span className="badge warning">{`${shortages} ${es ? 'con faltantes' : 'ingredients short'}`}</span>
        <span className="badge">{`${coverage.length - shortages} ${es ? 'cubiertos' : 'covered'}`}</span>
      </div>
      {!coverage.length && <p>{es ? 'No hay demanda de pedidos abiertos.' : 'No open-order ingredient demand yet.'}</p>}
      <div className="demand-cards">
        {coverage.map((line) => (
          <article className={`demand-card ${line.shortage > 0 ? 'demand-short' : ''}`} key={line.ingredientId}>
            <div className="dashboard-order-heading">
              <Link href={`/app/ingredients/${line.ingredientId}`}><strong>{line.name}</strong></Link>
              <span className={`badge ${line.shortage > 0 ? 'warning' : ''}`}>
                {line.shortage > 0 ? shortLabel : coveredLabel}
              </span>
            </div>
            <dl className="demand-quantities">
              {[
                [es ? 'Demanda total' : 'Total demand', line.demand],
                [es ? 'Disponible' : 'Usable stock', line.usable],
                [es ? 'Por recibir a tiempo' : 'Inbound by date', line.inbound],
                [es ? 'Faltante máximo' : 'Peak shortage', line.shortage],
              ].map(([label, value]) => (
                <div key={label}>
                  <dt>{label}</dt>
                  <dd>{`${formatNumber(Number(value))} ${line.uom}`}</dd>
                </div>
              ))}
            </dl>
            <small>{`${es ? 'Disponibilidad al' : 'Supply checked for'} ${formatDate(line.supplyDate)} · ${es ? 'Demanda acumulada' : 'Demand by then'} ${formatNumber(line.demandByDate)} ${line.uom}`}</small>
            {line.shortage > 0 && (
              <p>
                <Link href={`/app/purchasing?plan=${line.planId}`}>
                  {`${es ? 'Se necesita desde' : 'Needed from'} ${formatDate(line.neededOn)} →`}
                </Link>
              </p>
            )}
          </article>
        ))}
      </div>
      {shortages > 0 && (
        <>
          <p className="muted-text">
            {es
              ? 'Agrupa por proveedor y pedido, redondea a paquetes completos y usa el proveedor preferido. Revisa fechas y cantidades antes de realizar las compras.'
              : 'Group by supplier and supporting order, round to whole packs, and use preferred suppliers. Review quantities and required arrival dates before placing orders.'}
          </p>
          {canGenerate && <DemandPurchaseButton es={es} />}
        </>
      )}
    </section>
  );
}
