import { z } from 'zod';
import type { Customer, CustomerOption } from '@/domain/customer-pricing';
import type {
  Recipe, RecipeLine, RecipeVersion,
} from '@/domain/recipes';
import type { Ingredient, Supplier, SupplierItem } from '@/domain/master-data';
import type { SupplierPrice } from '@/features/supplier-pricing/domain';

const calendarDateSchema = z.iso.date();

export interface RecipeCostingProduct {
  id: string;
  name: string;
  productCode: string | null;
  active: boolean;
  recipeName: string | null;
  version: RecipeVersion | null;
  lines: RecipeCostingLine[];
  customerOptions: RecipeCostingCustomerOption[];
  setupWarning: 'missing_recipe' | 'missing_released_recipe' | 'empty_recipe' | null;
}

export interface RecipeCostingCustomerOption extends CustomerOption {
  customerName: string;
}

export interface RecipeCostingLine {
  id: string;
  ingredientId: string;
  ingredientName: string | null;
  ingredientActive: boolean;
  quantity: number;
  uom: string;
  suppliers: RecipeCostingSupplierSource[];
}

export interface RecipeCostingSupplierSource extends SupplierItem {
  supplierName: string | null;
  supplierActive: boolean;
  prices: SupplierPrice[];
}

export interface RecipeCostingSource {
  products: {
    id: string;
    name: string;
    product_code: string | null;
    active: boolean;
  }[];
  recipes: Recipe[];
  versions: RecipeVersion[];
  lines: RecipeLine[];
  ingredients: Ingredient[];
  suppliers: Supplier[];
  supplierItems: SupplierItem[];
  prices: SupplierPrice[];
  customers: Customer[];
  customerOptions: CustomerOption[];
}

export type RecipeCostWarningCode = 'missing_recipe'
  | 'missing_released_recipe'
  | 'empty_recipe'
  | 'missing_ingredient'
  | 'inactive_ingredient'
  | 'missing_preferred_supplier'
  | 'ambiguous_preferred_supplier'
  | 'missing_price'
  | 'incompatible_uom'
  | 'zero_sale_price';

export interface RecipeCostWarning {
  code: RecipeCostWarningCode;
  ingredientName?: string;
  recipeUom?: string;
  supplierUom?: string;
}

export interface PricedRecipeLine extends RecipeCostingLine {
  selectedSupplier: RecipeCostingSupplierSource | null;
  effectivePrice: SupplierPrice | null;
  ingredientCost: number | null;
  warning: RecipeCostWarning | null;
}

export interface ProductCostResult {
  lines: PricedRecipeLine[];
  warnings: RecipeCostWarning[];
  batchCost: number | null;
  costPerGallon: number | null;
  selectedOption: RecipeCostingCustomerOption | null;
  packageCost: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
}

function latestEffectivePrice(prices: SupplierPrice[], asOfDate: string) {
  return prices
    .filter((price) => price.effective_on <= asOfDate)
    .sort((left, right) => (
      right.effective_on.localeCompare(left.effective_on)
      || right.created_at.localeCompare(left.created_at)
    ))[0] ?? null;
}

function buildSupplierSource(
  item: SupplierItem,
  suppliers: Supplier[],
  prices: SupplierPrice[],
): RecipeCostingSupplierSource {
  const supplier = suppliers.find((candidate) => candidate.id === item.supplier_id);
  return {
    ...item,
    supplierName: supplier?.name ?? null,
    supplierActive: supplier?.active ?? false,
    prices: prices.filter((price) => price.supplier_item_id === item.id),
  };
}

/** Maps RLS-scoped records into a lean, serializable catalog for read-only costing. */
export function buildRecipeCostingCatalog(source: RecipeCostingSource): RecipeCostingProduct[] {
  return source.products.map((product) => {
    const recipe = source.recipes.find((candidate) => candidate.product_id === product.id);
    const version = recipe?.active_version_id
      ? source.versions.find((candidate) => (
        candidate.id === recipe.active_version_id
        && candidate.recipe_id === recipe.id
        && candidate.status === 'Released'
      )) ?? null
      : null;
    const recipeLines = version
      ? source.lines.filter((line) => line.recipe_version_id === version.id)
      : [];
    let setupWarning: RecipeCostingProduct['setupWarning'] = null;
    if (!recipe) setupWarning = 'missing_recipe';
    else if (!version) setupWarning = 'missing_released_recipe';
    else if (!recipeLines.length) setupWarning = 'empty_recipe';

    return {
      id: product.id,
      name: product.name,
      productCode: product.product_code,
      active: product.active,
      recipeName: recipe?.name ?? null,
      version,
      lines: recipeLines.map((line) => {
        const ingredient = source.ingredients.find(
          (candidate) => candidate.id === line.ingredient_id,
        );
        return {
          id: line.id,
          ingredientId: line.ingredient_id,
          ingredientName: ingredient?.name ?? null,
          ingredientActive: ingredient?.active ?? false,
          quantity: line.normalized_quantity,
          uom: line.normalized_uom,
          suppliers: source.supplierItems
            .filter((item) => item.ingredient_id === line.ingredient_id)
            .map((item) => buildSupplierSource(item, source.suppliers, source.prices)),
        };
      }),
      customerOptions: source.customerOptions
        .filter((option) => option.product_id === product.id && option.active)
        .flatMap((option) => {
          const customer = source.customers.find(
            (candidate) => candidate.id === option.customer_id,
          );
          return customer ? [{ ...option, customerName: customer.name }] : [];
        })
        .sort((left, right) => (
          left.customerName.localeCompare(right.customerName)
          || left.label.localeCompare(right.label)
        )),
      setupWarning,
    };
  }).sort((left, right) => left.name.localeCompare(right.name));
}

function unavailableLine(
  line: RecipeCostingLine,
  warning: RecipeCostWarning,
): PricedRecipeLine {
  return {
    ...line,
    selectedSupplier: null,
    effectivePrice: null,
    ingredientCost: null,
    warning,
  };
}

function priceRecipeLine(line: RecipeCostingLine, asOfDate: string): PricedRecipeLine {
  const ingredientName = line.ingredientName ?? undefined;
  if (!line.ingredientName) {
    return unavailableLine(line, { code: 'missing_ingredient' });
  }
  if (!line.ingredientActive) {
    return unavailableLine(line, { code: 'inactive_ingredient', ingredientName });
  }
  const preferred = line.suppliers.filter((supplier) => (
    supplier.active && supplier.supplierActive && supplier.is_preferred
  ));
  if (!preferred.length) {
    return unavailableLine(line, { code: 'missing_preferred_supplier', ingredientName });
  }
  if (preferred.length > 1) {
    return unavailableLine(line, { code: 'ambiguous_preferred_supplier', ingredientName });
  }
  const selectedSupplier = preferred[0];
  if (!selectedSupplier) {
    return unavailableLine(line, { code: 'missing_preferred_supplier', ingredientName });
  }
  const effectivePrice = latestEffectivePrice(selectedSupplier.prices, asOfDate);
  if (!effectivePrice) {
    return unavailableLine(line, { code: 'missing_price', ingredientName });
  }
  if (effectivePrice.pack_quantity_uom !== line.uom) {
    return {
      ...unavailableLine(line, {
        code: 'incompatible_uom',
        ingredientName,
        recipeUom: line.uom,
        supplierUom: effectivePrice.pack_quantity_uom,
      }),
      selectedSupplier,
      effectivePrice,
    };
  }
  return {
    ...line,
    selectedSupplier,
    effectivePrice,
    ingredientCost: (line.quantity / effectivePrice.pack_quantity) * effectivePrice.unit_price,
    warning: null,
  };
}

/**
 * Prices one released batch from effective supplier price facts.
 * Aggregate and margin values remain unavailable whenever any ingredient cannot be priced safely.
 */
export function calculateProductCost(
  product: RecipeCostingProduct,
  asOfDateInput: string,
  customerOptionId?: string,
): ProductCostResult {
  const asOfDate = calendarDateSchema.parse(asOfDateInput);
  const lines = product.lines.map((line) => priceRecipeLine(line, asOfDate));
  const warnings = [...new Map(
    lines.flatMap((line) => (line.warning ? [line.warning] : []))
      .map((warning) => [
        `${warning.code}:${warning.ingredientName ?? ''}:${warning.recipeUom ?? ''}:${warning.supplierUom ?? ''}`,
        warning,
      ]),
  ).values()];
  if (product.setupWarning) warnings.unshift({ code: product.setupWarning });
  const complete = product.version !== null
    && product.lines.length > 0
    && lines.every((line) => line.ingredientCost !== null)
    && !product.setupWarning;
  const batchCost = complete
    ? lines.reduce((sum, line) => sum + (line.ingredientCost ?? 0), 0)
    : null;
  const costPerGallon = batchCost === null || !product.version
    ? null
    : batchCost / product.version.target_yield_gallons;
  const selectedOption = customerOptionId
    ? product.customerOptions.find((option) => option.id === customerOptionId) ?? null
    : null;
  const packageCost = costPerGallon === null || !selectedOption
    ? null
    : costPerGallon * selectedOption.gallons_per_unit;
  const grossProfit = packageCost === null || !selectedOption
    ? null
    : selectedOption.unit_price - packageCost;
  let grossMarginPercent: number | null = null;
  if (grossProfit !== null && selectedOption && selectedOption.unit_price > 0) {
    grossMarginPercent = (grossProfit / selectedOption.unit_price) * 100;
  } else if (packageCost !== null && selectedOption?.unit_price === 0) {
    warnings.push({ code: 'zero_sale_price' });
  }
  return {
    lines,
    warnings,
    batchCost,
    costPerGallon,
    selectedOption,
    packageCost,
    grossProfit,
    grossMarginPercent,
  };
}
