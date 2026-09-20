import type { CustomerOrder } from '@/domain/customer-orders';
import type { ProductionPlan, MixerBatch } from '@/domain/production';
import type { MaterialAvailability } from '@/domain/purchasing';
import { formatDate, formatNumber } from '@/domain/format';
import ProductionForm from './production-form';

export default function OrderProduction({
  order, plan, batches, requirements, canWrite, active, locale,
}: {
  order: CustomerOrder;
  plan: ProductionPlan | undefined;
  batches: (MixerBatch & { spice_preparation_id: string })[];
  requirements: MaterialAvailability[];
  canWrite: boolean;
  active: boolean;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const shortageCount = requirements.filter((requirement) => requirement.shortage > 0).length;
  const batchCount = order.items.reduce((total, item) => total + item.batch_count, 0);
  const coveredLabel = es ? 'Los ingredientes están cubiertos por existencias y compras confirmadas para el inicio.' : 'Ingredients are covered by usable stock and confirmed inbound by the start date.';
  const shortageLabel = es ? 'ingredientes con faltantes para la fecha de inicio. Revisa las compras antes de producir.' : 'ingredients have shortages by the start date. Review purchasing before production.';
  const status = plan?.status ?? 'Unplanned';
  const labels = es ? {
    Draft: 'Borrador', Confirmed: 'Confirmado', Cancelled: 'Cancelado', Unplanned: 'Sin planificar',
  }
    : {
      Draft: 'Draft', Confirmed: 'Confirmed', Cancelled: 'Cancelled', Unplanned: 'Not planned',
    };
  return (
    <section className="panel" aria-labelledby="production-heading">
      <div className="section-heading">
        <h2 id="production-heading">{es ? 'Preparación de producción' : 'Production preparation'}</h2>
        <span className="badge">{labels[status]}</span>
      </div>
      <p>{es ? 'Define las fechas y revisa los ingredientes antes de confirmar. Cada lote de mezcla tiene una preparación de especias.' : 'Set dates and review ingredients before confirming. Each mixer batch has one spice preparation.'}</p>
      <div className="production-summary">
        <div>
          <strong>{formatNumber(batchCount)}</strong>
          <span>{es ? 'Lotes de mezcla' : 'Mixer batches'}</span>
        </div>
        <div>
          <strong>{formatNumber(batchCount)}</strong>
          <span>{es ? 'Preparaciones de especias' : 'Spice preparations'}</span>
        </div>
        <div>
          <strong>{formatNumber(batchCount * 40)}</strong>
          <span>{es ? 'Galones previstos' : 'Planned gallons'}</span>
        </div>
      </div>
      {plan && <p>{`${formatDate(plan.start_on)} – ${formatDate(plan.finish_on)}`}</p>}
      {plan && plan.status !== 'Cancelled' && (
        <p className={shortageCount ? 'notice' : ''}>
          {shortageCount
            ? `${shortageCount} ${shortageLabel}`
            : coveredLabel}
        </p>
      )}
      <p className="muted">{es ? 'Fechas locales de la planta. La confirmación conserva los compromisos; no descuenta inventario. La asignación del equipo se realiza en la siguiente etapa.' : 'Dates use the facility calendar. Confirmation keeps ingredient commitments; it does not consume inventory. Crew assignments come in the scheduling step.'}</p>
      {plan?.shortage_reason && (
      <p>
        <strong>{es ? 'Plan para faltantes: ' : 'Shortage resolution: '}</strong>
        {plan.shortage_reason}
      </p>
      )}
      {canWrite && active && (
        <ProductionForm
          key={plan?.revision ?? 0}
          orderId={order.id}
          dueDate={order.needed_on}
          plan={plan}
          locale={locale}
        />
      )}
      {!!batches.length && (
        <details>
          <summary>{es ? 'Ver lotes y preparaciones' : 'View mixer batches & spice preparations'}</summary>
          <div className="production-batches">
            {order.items.map((item) => (
              <div key={item.product_id}>
                <h3>{item.product_name}</h3>
                <p>
                  <span>
                    {es ? 'Receta guardada' : 'Saved recipe'}
                    {` v${item.version_number}`}
                  </span>
                </p>
                {batches.filter((batch) => batch.product_id === item.product_id)
                  .toSorted((a, b) => a.sequence - b.sequence).map((batch) => (
                    <p className="production-batch" key={batch.id}>
                      <strong>{`${es ? 'Lote' : 'Batch'} ${batch.sequence} · ${batch.target_gallons} gal`}</strong>
                      <span>{`MX-${batch.id.slice(0, 8)}`}</span>
                      <span>{`SP-${batch.spice_preparation_id.slice(0, 8)}`}</span>
                    </p>
                  ))}
              </div>
            ))}
          </div>
        </details>
      )}
    </section>
  );
}
