'use client';

import {
  useDeferredValue, useMemo, useState,
} from 'react';
import { formatPrice } from '@/domain/customer-pricing';
import { formatNumber } from '@/domain/format';
import {
  calculateProductCost,
  type ProductCostResult,
  type RecipeCostWarning,
  type RecipeCostingProduct,
} from './domain';
import styles from './recipe-costing.module.css';

type ReadinessFilter = 'all' | 'ready' | 'unavailable';

function warningText(warning: RecipeCostWarning, es: boolean) {
  const ingredient = warning.ingredientName ?? (es ? 'Ingrediente desconocido' : 'Unknown ingredient');
  switch (warning.code) {
    case 'missing_recipe':
      return es ? 'El producto no tiene receta.' : 'This product does not have a recipe.';
    case 'missing_released_recipe':
      return es
        ? 'Selecciona una versión de receta activa y publicada.'
        : 'Select an active released recipe version.';
    case 'empty_recipe':
      return es ? 'La receta publicada no tiene ingredientes.' : 'The released recipe has no ingredients.';
    case 'missing_ingredient':
      return es
        ? 'No se pudo leer un ingrediente de la receta.'
        : 'A recipe ingredient could not be read.';
    case 'inactive_ingredient':
      return es ? `${ingredient} está inactivo.` : `${ingredient} is inactive.`;
    case 'missing_preferred_supplier':
      return es
        ? `${ingredient} necesita un artículo de proveedor activo y preferido.`
        : `${ingredient} needs an active preferred supplier item.`;
    case 'ambiguous_preferred_supplier':
      return es
        ? `${ingredient} tiene varios artículos de proveedor preferidos.`
        : `${ingredient} has multiple preferred supplier items.`;
    case 'missing_price':
      return es
        ? `${ingredient} no tiene un precio vigente en esta fecha.`
        : `${ingredient} has no effective price on this date.`;
    case 'incompatible_uom':
      return es
        ? `${ingredient} usa ${warning.recipeUom} en la receta y ${warning.supplierUom} en el paquete; configura una conversión aprobada antes de calcular.`
        : `${ingredient} uses ${warning.recipeUom} in the recipe and ${warning.supplierUom} in the pack; configure an approved conversion before costing.`;
    case 'zero_sale_price':
      return es
        ? 'No se puede calcular el porcentaje de margen con un precio de venta de $0.'
        : 'Margin percentage is unavailable for a $0 sale price.';
    default:
      return es ? 'El costo no está disponible.' : 'Cost is unavailable.';
  }
}

function parseReadiness(value: string): ReadinessFilter {
  if (value === 'ready' || value === 'unavailable') return value;
  return 'all';
}

function Metric({
  label,
  value,
  muted = false,
}: {
  label: string;
  value: string;
  muted?: boolean;
}) {
  return (
    <div className={muted ? styles.metricMuted : styles.metric}>
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function CostCard({
  product,
  result,
  optionId,
  onOptionChange,
  es,
}: {
  product: RecipeCostingProduct;
  result: ProductCostResult;
  optionId: string;
  onOptionChange: (optionId: string) => void;
  es: boolean;
}) {
  const available = result.batchCost !== null;
  let readinessLabel = es ? 'Requiere atención' : 'Needs attention';
  if (available) readinessLabel = es ? 'Costo listo' : 'Cost ready';
  let recipeSummary = es ? 'Sin receta publicada activa' : 'No active released recipe';
  if (product.version && product.recipeName) {
    recipeSummary = `${product.recipeName} · v${product.version.version_number} · ${formatNumber(product.version.target_yield_gallons)} gal`;
  }
  let packageCostLabel = es ? 'Costo del paquete' : 'Package cost';
  if (result.selectedOption) {
    packageCostLabel = `${es ? 'Costo' : 'Cost'} / ${result.selectedOption.unit_name}`;
  }
  return (
    <article className={styles.card}>
      <div className={styles.cardHeader}>
        <div>
          <div className={styles.titleRow}>
            <h3>{product.name}</h3>
            <span className={available ? styles.readyBadge : styles.warningBadge}>
              {readinessLabel}
            </span>
          </div>
          <p>
            {product.productCode ? `${product.productCode} · ` : ''}
            {recipeSummary}
          </p>
        </div>
        <label className={styles.optionPicker} htmlFor={`margin-option-${product.id}`}>
          <span>{es ? 'Precio del cliente' : 'Customer price'}</span>
          <select
            id={`margin-option-${product.id}`}
            value={optionId}
            onChange={(event) => onOptionChange(event.currentTarget.value)}
          >
            <option value="">{es ? 'Seleccionar para ver margen' : 'Select to view margin'}</option>
            {product.customerOptions.map((option) => (
              <option key={option.id} value={option.id}>
                {`${option.customerName} · ${option.label} · ${formatPrice(option.unit_price)}/${option.unit_name}`}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className={styles.metrics}>
        <Metric
          label={es ? 'Costo del lote' : 'Batch cost'}
          value={result.batchCost === null ? '—' : formatPrice(result.batchCost)}
          muted={result.batchCost === null}
        />
        <Metric
          label={es ? 'Costo por galón' : 'Cost / gallon'}
          value={result.costPerGallon === null ? '—' : formatPrice(result.costPerGallon)}
          muted={result.costPerGallon === null}
        />
        <Metric
          label={packageCostLabel}
          value={result.packageCost === null ? '—' : formatPrice(result.packageCost)}
          muted={result.packageCost === null}
        />
        <Metric
          label={es ? 'Ganancia bruta' : 'Gross profit'}
          value={result.grossProfit === null ? '—' : formatPrice(result.grossProfit)}
          muted={result.grossProfit === null}
        />
        <Metric
          label={es ? 'Margen bruto' : 'Gross margin'}
          value={result.grossMarginPercent === null
            ? '—'
            : `${formatNumber(result.grossMarginPercent)}%`}
          muted={result.grossMarginPercent === null}
        />
      </div>

      {result.warnings.length ? (
        <div className={styles.warnings} role="status">
          <strong>{es ? 'Completa estos datos para calcular' : 'Complete these items to calculate'}</strong>
          <ul>
            {result.warnings.map((warning) => (
              <li key={`${warning.code}-${warning.ingredientName ?? ''}-${warning.recipeUom ?? ''}-${warning.supplierUom ?? ''}`}>
                {warningText(warning, es)}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {result.lines.length ? (
        <details className={styles.breakdown}>
          <summary>{es ? 'Ver costo por ingrediente' : 'View ingredient cost breakdown'}</summary>
          <div className={styles.tableWrap}>
            <table>
              <thead>
                <tr>
                  <th>{es ? 'Ingrediente' : 'Ingredient'}</th>
                  <th>{es ? 'Cantidad del lote' : 'Batch quantity'}</th>
                  <th>{es ? 'Fuente de precio' : 'Price source'}</th>
                  <th>{es ? 'Costo' : 'Cost'}</th>
                </tr>
              </thead>
              <tbody>
                {result.lines.map((line) => (
                  <tr key={line.id}>
                    <td>{line.ingredientName ?? (es ? 'No disponible' : 'Unavailable')}</td>
                    <td>{`${formatNumber(line.quantity)} ${line.uom}`}</td>
                    <td>
                      {line.selectedSupplier && line.effectivePrice ? (
                        <>
                          <strong>{line.selectedSupplier.supplierName ?? (es ? 'Proveedor' : 'Supplier')}</strong>
                          <span>
                            {`${line.selectedSupplier.supplier_sku || (es ? 'Sin SKU' : 'No SKU')} · ${formatPrice(line.effectivePrice.unit_price)} / ${line.effectivePrice.purchase_uom}`}
                          </span>
                        </>
                      ) : <span>{es ? 'No disponible' : 'Unavailable'}</span>}
                    </td>
                    <td>{line.ingredientCost === null ? '—' : formatPrice(line.ingredientCost)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      ) : null}
    </article>
  );
}

export default function RecipeCostingWorkspace({
  products,
  currentDate,
  locale,
}: {
  products: RecipeCostingProduct[];
  currentDate: string;
  locale: 'en' | 'es';
}) {
  const es = locale === 'es';
  const [asOfDate, setAsOfDate] = useState(currentDate);
  const [query, setQuery] = useState('');
  const deferredQuery = useDeferredValue(query);
  const [readiness, setReadiness] = useState<ReadinessFilter>('all');
  const [optionIds, setOptionIds] = useState<Record<string, string>>({});
  const costedProducts = useMemo(() => products.map((product) => ({
    product,
    result: calculateProductCost(product, asOfDate, optionIds[product.id]),
  })), [asOfDate, optionIds, products]);
  const normalizedQuery = deferredQuery.trim().toLocaleLowerCase();
  const visibleProducts = costedProducts.filter(({ product, result }) => {
    const matchesSearch = !normalizedQuery || [
      product.name,
      product.productCode ?? '',
      product.recipeName ?? '',
      ...product.lines.map((line) => line.ingredientName ?? ''),
    ].some((value) => value.toLocaleLowerCase().includes(normalizedQuery));
    const matchesReadiness = readiness === 'all'
      || (readiness === 'ready' && result.batchCost !== null)
      || (readiness === 'unavailable' && result.batchCost === null);
    return matchesSearch && matchesReadiness;
  });
  const readyCount = costedProducts.filter(({ result }) => result.batchCost !== null).length;

  return (
    <section className={styles.workspace} aria-label={es ? 'Costos y márgenes' : 'Recipe costs and margins'}>
      <div className={styles.intro}>
        <div>
          <p className={styles.eyebrow}>{es ? 'COSTO DEL PRODUCTO' : 'PRODUCT COSTING'}</p>
          <h2>{es ? 'Costos de recetas y márgenes' : 'Recipe costs and product margins'}</h2>
          <p>
            {es
              ? 'Calcula con recetas publicadas y precios preferidos de proveedores vigentes en la fecha elegida.'
              : 'Cost released recipes with preferred supplier prices effective on the selected date.'}
          </p>
        </div>
        <div className={styles.summary}>
          <strong>{readyCount}</strong>
          <span>{es ? `de ${products.length} listos` : `of ${products.length} ready`}</span>
        </div>
      </div>

      <div className={styles.toolbar}>
        <label className={styles.search} htmlFor="recipe-cost-search">
          <span>{es ? 'Buscar productos o ingredientes' : 'Search products or ingredients'}</span>
          <input
            id="recipe-cost-search"
            type="search"
            value={query}
            onChange={(event) => setQuery(event.currentTarget.value)}
            placeholder={es ? 'Producto, código, receta, ingrediente…' : 'Product, code, recipe, ingredient…'}
          />
        </label>
        <label htmlFor="recipe-cost-date">
          <span>{es ? 'Costos vigentes al' : 'Costs effective on'}</span>
          <input
            id="recipe-cost-date"
            type="date"
            value={asOfDate}
            onChange={(event) => {
              if (event.currentTarget.value) setAsOfDate(event.currentTarget.value);
            }}
            required
          />
        </label>
        <label htmlFor="recipe-cost-readiness">
          <span>{es ? 'Estado' : 'Readiness'}</span>
          <select
            id="recipe-cost-readiness"
            value={readiness}
            onChange={(event) => setReadiness(parseReadiness(event.currentTarget.value))}
          >
            <option value="all">{es ? 'Todos los productos' : 'All products'}</option>
            <option value="ready">{es ? 'Costo listo' : 'Cost ready'}</option>
            <option value="unavailable">{es ? 'Requiere atención' : 'Needs attention'}</option>
          </select>
        </label>
        <button
          type="button"
          className="button secondary"
          onClick={() => {
            setQuery('');
            setReadiness('all');
            setAsOfDate(currentDate);
          }}
        >
          {es ? 'Restablecer' : 'Reset view'}
        </button>
      </div>

      <div className={styles.resultBar} aria-live="polite">
        <strong>{visibleProducts.length.toLocaleString()}</strong>
        {es ? ' productos' : ' products'}
        <span>
          {es
            ? 'Los cálculos excluyen mano de obra, empaque, flete, impuestos y gastos generales.'
            : 'Calculations exclude labor, packaging, freight, tax, and overhead.'}
        </span>
      </div>

      {!visibleProducts.length ? (
        <div className={styles.empty}>
          <h3>{es ? 'No hay productos en esta vista' : 'No products match this view'}</h3>
          <p>{es ? 'Ajusta la búsqueda o restablece los filtros.' : 'Try another search or reset the filters.'}</p>
        </div>
      ) : (
        <div className={styles.cards}>
          {visibleProducts.map(({ product, result }) => (
            <CostCard
              key={product.id}
              product={product}
              result={result}
              optionId={optionIds[product.id] ?? ''}
              onOptionChange={(optionId) => setOptionIds((current) => ({
                ...current,
                [product.id]: optionId,
              }))}
              es={es}
            />
          ))}
        </div>
      )}
    </section>
  );
}
