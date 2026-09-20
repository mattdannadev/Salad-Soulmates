import { formatNumber } from '@/domain/format';
import recipeText from '@/domain/recipe-text';

/** Keep unknown stock distinct from a recorded zero; quantities use the ingredient's base unit. */
export default function IngredientStock({ quantity, unit, locale }: {
  quantity: number | undefined;
  unit: string;
  locale: 'en' | 'es';
}) {
  const explanation = recipeText(locale, 'Recorded stock at your facility. Commitments and expiry are checked on customer orders.');
  return (
    <details className="ingredient-stock">
      <summary title={explanation}>
        {recipeText(locale, 'On hand')}
        {': '}
        {quantity === undefined ? recipeText(locale, 'Not recorded') : `${formatNumber(quantity)} ${unit}`}
      </summary>
      <p>{explanation}</p>
      {quantity !== undefined && quantity < 0 && <p className="notice">{recipeText(locale, 'Review negative balance')}</p>}
    </details>
  );
}
