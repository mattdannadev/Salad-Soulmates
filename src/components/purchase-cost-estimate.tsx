import {
  estimatePurchaseCosts,
  type PurchasePlanningPrice,
} from '@/domain/purchasing';

interface EstimateItem {
  id: string;
  label: string;
  supplierItemId: string;
  purchaseUom: string;
  purchaseUnits: number;
}

function formatCurrency(value: number, locale: 'en' | 'es') {
  return new Intl.NumberFormat(locale === 'es' ? 'es-US' : 'en-US', {
    style: 'currency',
    currency: 'USD',
  }).format(value);
}

/** Shows planning-only supplier-price estimates without replacing a confirmed quote. */
export default function PurchaseCostEstimate({
  items,
  prices,
  expectedOn,
  locale,
}: {
  items: EstimateItem[];
  prices: PurchasePlanningPrice[];
  expectedOn: string;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const activeItems = items.filter((item) => item.purchaseUnits > 0);
  if (!activeItems.length) {
    return (
      <p className="notice">
        {es
          ? 'Ingresa presentaciones completas para calcular el costo estimado.'
          : 'Enter whole packs to calculate an estimated cost.'}
      </p>
    );
  }
  if (!expectedOn) {
    return (
      <p className="notice">
        {es
          ? 'Elige la fecha prevista para usar los precios vigentes en esa fecha.'
          : 'Choose the expected delivery date to use prices effective on that date.'}
      </p>
    );
  }
  const estimate = estimatePurchaseCosts(
    activeItems.map((item) => ({
      supplierItemId: item.supplierItemId,
      purchaseUnits: item.purchaseUnits,
    })),
    prices,
    expectedOn,
  );
  let totalText: string;
  if (estimate.total === null) {
    totalText = es
      ? `No disponible: faltan precios para ${estimate.missingPriceCount} línea(s).`
      : `Unavailable: ${estimate.missingPriceCount} line(s) are missing a supplier price.`;
  } else {
    totalText = formatCurrency(estimate.total, locale);
  }
  return (
    <div className="table-wrap">
      <table>
        <caption>{es ? 'Estimación de costo del borrador' : 'Draft cost estimate'}</caption>
        <thead>
          <tr>
            <th scope="col">{es ? 'Ingrediente' : 'Ingredient'}</th>
            <th scope="col">{es ? 'Unidades' : 'Units'}</th>
            <th scope="col">{es ? 'Costo unitario estimado' : 'Estimated unit cost'}</th>
            <th scope="col">{es ? 'Costo de línea estimado' : 'Estimated line cost'}</th>
          </tr>
        </thead>
        <tbody>
          {activeItems.map((item, index) => {
            const line = estimate.lines[index];
            let unitCostText = es ? 'Precio faltante' : 'Missing price';
            if (line?.unitCost != null) unitCostText = formatCurrency(line.unitCost, locale);
            return (
              <tr key={item.id}>
                <th scope="row">{item.label}</th>
                <td>{`${item.purchaseUnits} ${item.purchaseUom}`}</td>
                <td>{unitCostText}</td>
                <td>{line?.lineCost === null ? '—' : formatCurrency(line?.lineCost ?? 0, locale)}</td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <p className={estimate.total === null ? 'notice' : undefined}>
        <strong>{es ? 'Total estimado del borrador' : 'Estimated draft total'}</strong>
        {': '}
        {totalText}
      </p>
      <small>
        {es
          ? `Estimación según precios vigentes al ${expectedOn}. El total cotizado por el proveedor se registra por separado al confirmar.`
          : `Estimate from prices effective ${expectedOn}. Record the supplier-quoted total separately when confirming.`}
      </small>
    </div>
  );
}
