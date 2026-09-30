import { formatNumber } from '@/domain/format';
import recipeText from '@/domain/recipe-text';

/** Read-only current-facility reference quantities; inventory operations stay in Inventory. */
export default function IngredientReferenceSummary({
  facilityName, unit, quantities, locale,
}: {
  facilityName: string;
  unit: string;
  quantities: { onHand: number; inbound: number; committed: number } | null;
  locale: 'en' | 'es';
}) {
  return (
    <section className="panel" aria-labelledby="inventory-reference-heading">
      <h2 id="inventory-reference-heading">
        {locale === 'es' ? 'Referencia de inventario' : 'Inventory reference'}
      </h2>
      <p>
        {locale === 'es' ? 'Solo consulta · ' : 'Read-only · '}
        {facilityName}
      </p>
      {quantities ? (
        <dl>
          <dt>{recipeText(locale, 'On hand')}</dt>
          <dd>{formatNumber(quantities.onHand)} {unit}</dd>
          <dt>{locale === 'es' ? 'Entrante en órdenes de compra abiertas' : 'Open purchase-order inbound'}</dt>
          <dd>{formatNumber(quantities.inbound)} {unit}</dd>
          <dt>{locale === 'es' ? 'Comprometido con planes de producción activos' : 'Committed to active production plans'}</dt>
          <dd>{formatNumber(quantities.committed)} {unit}</dd>
        </dl>
      ) : <p>{recipeText(locale, 'Inventory details unavailable with your access')}</p>}
    </section>
  );
}
