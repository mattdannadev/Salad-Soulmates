import Link from 'next/link';
import type { MaterialAvailability, MaterialPlan } from '@/domain/purchasing';
import { formatDate, formatNumber } from '@/domain/format';

export default function OrderRequirements({
  plan, requirements, locale, productionStart = undefined,
}: {
  plan: MaterialPlan;
  requirements: MaterialAvailability[];
  locale: 'en' | 'es';
  productionStart?: string;
}) {
  const es = locale === 'es';
  return (
    <section className="panel">
      <div className="section-heading">
        <h2>{es ? 'Ingredientes y estimación de compras' : 'Ingredient needs & purchasing'}</h2>
        {plan.status === 'Active' && (
          <Link className="button" href={`/app/purchasing?plan=${plan.id}`}>
            {es ? 'Revisar faltantes y compras' : 'Review shortages & purchases'}
          </Link>
        )}
      </div>
      <p>
        {es
          ? 'Las cantidades provienen de los productos y lotes del pedido. La estimación se actualiza con las existencias y compras confirmadas.'
          : 'Recipe-based totals combine every batch in this order. Compare each ingredient’s requirement with stock, commitments, and confirmed inbound purchases below.'}
      </p>
      {plan.status === 'Cancelled' ? (
        <p>{es ? 'Compromisos liberados. Se conserva el historial.' : 'Commitments released. The original requirements remain in history.'}</p>
      ) : null}
      {plan.status !== 'Cancelled' && productionStart && (
        <p>{`${es ? 'Disponibilidad revisada para el inicio de producción:' : 'Availability checked for production start:'} ${formatDate(productionStart)}`}</p>
      )}
      {plan.status !== 'Cancelled' && !productionStart && (
        <p>
          {es
            ? 'La fecha requerida por el cliente es el horizonte de esta estimación. El inicio de producción y las fechas de llegada de ingredientes aún no están programados.'
            : 'The customer-needed date is the horizon for this estimate. Save production dates above to check ingredients against the start date.'}
        </p>
      )}
      <div className="table-wrap">
        <table>
          <caption className="sr-only">{es ? 'Requisitos por ingrediente' : 'Ingredient requirements'}</caption>
          <thead>
            <tr>
              {(es ? ['Ingrediente', 'Requerido', 'Existencias utilizables', 'Otros compromisos', 'Entrada confirmada', 'Faltante']
                : ['Ingredient', 'Recipe total', 'Usable stock', 'Other commitments', 'Confirmed inbound', 'Shortage'])
                .map((heading) => <th key={heading} scope="col">{heading}</th>)}
            </tr>
          </thead>
          <tbody>
            {plan.requirements.map((requirement) => {
              const availability = requirements.find(
                (row) => row.ingredient_id === requirement.ingredient_id,
              );
              return (
                <tr key={requirement.ingredient_id}>
                  <th scope="row"><Link href={`/app/ingredients/${requirement.ingredient_id}`}>{requirement.ingredient_name}</Link></th>
                  <td>{`${formatNumber(requirement.required)} ${requirement.uom}`}</td>
                  {availability ? (
                    <>
                      <td>{formatNumber(availability.on_hand)}</td>
                      <td>{formatNumber(availability.other_commitments)}</td>
                      <td>{formatNumber(availability.confirmed_inbound)}</td>
                      <td><strong>{formatNumber(availability.shortage)}</strong></td>
                    </>
                  ) : <td colSpan={4}>—</td>}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <details>
        <summary>{es ? 'Cómo se calcularon las cantidades' : 'How these quantities were calculated'}</summary>
        {plan.requirements.map((requirement) => (
          <div key={requirement.ingredient_id}>
            <h3>{requirement.ingredient_name}</h3>
            <ul>
              {requirement.contributions.map((item) => (
                <li key={item.recipe_line_id}>
                  {`${item.product_name} v${item.version_number}: ${item.batch_count} × ${formatNumber(item.per_batch)} = ${formatNumber(item.quantity)} ${requirement.uom}`}
                </li>
              ))}
            </ul>
          </div>
        ))}
      </details>
    </section>
  );
}
