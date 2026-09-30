import { describe, expect, it } from 'vitest';
import {
  buildRecipeCostingCatalog,
  calculateProductCost,
  type RecipeCostingSource,
} from '@/features/recipe-costing/domain';
import type { SupplierPrice } from '@/features/supplier-pricing/domain';

const ids = {
  product: '00000000-0000-4000-8000-000000000001',
  recipe: '00000000-0000-4000-8000-000000000002',
  version: '00000000-0000-4000-8000-000000000003',
  section: '00000000-0000-4000-8000-000000000004',
  firstLine: '00000000-0000-4000-8000-000000000005',
  secondLine: '00000000-0000-4000-8000-000000000006',
  firstIngredient: '00000000-0000-4000-8000-000000000007',
  secondIngredient: '00000000-0000-4000-8000-000000000008',
  supplier: '00000000-0000-4000-8000-000000000009',
  firstSupplierItem: '00000000-0000-4000-8000-000000000010',
  secondSupplierItem: '00000000-0000-4000-8000-000000000011',
  customer: '00000000-0000-4000-8000-000000000012',
  option: '00000000-0000-4000-8000-000000000013',
};

function price(
  id: string,
  supplierItemId: string,
  effectiveOn: string,
  unitPrice: number,
  packQuantity: number,
  packQuantityUom: string,
): SupplierPrice {
  return {
    id,
    supplier_item_id: supplierItemId,
    unit_price: unitPrice,
    currency: 'USD',
    effective_on: effectiveOn,
    note: '',
    purchase_uom: 'case',
    pack_quantity: packQuantity,
    pack_quantity_uom: packQuantityUom,
    created_at: `${effectiveOn}T12:00:00Z`,
  };
}

function source(): RecipeCostingSource {
  return {
    products: [{
      id: ids.product, name: 'House Dressing', product_code: 'HD', active: true,
    }],
    recipes: [{
      id: ids.recipe,
      product_id: ids.product,
      name: 'House Dressing Recipe',
      active_version_id: ids.version,
    }],
    versions: [{
      id: ids.version,
      recipe_id: ids.recipe,
      version_number: 2,
      status: 'Released',
      target_yield_gallons: 40,
      released_at: '2026-09-01T12:00:00Z',
    }],
    lines: [
      {
        id: ids.firstLine,
        recipe_version_id: ids.version,
        recipe_section_id: ids.section,
        ingredient_id: ids.firstIngredient,
        sequence: 1,
        display_measurement: '10 lb',
        normalized_quantity: 10,
        normalized_uom: 'lb',
        operator_note: null,
      },
      {
        id: ids.secondLine,
        recipe_version_id: ids.version,
        recipe_section_id: ids.section,
        ingredient_id: ids.secondIngredient,
        sequence: 2,
        display_measurement: '5 gal',
        normalized_quantity: 5,
        normalized_uom: 'gal',
        operator_note: null,
      },
    ],
    ingredients: [
      {
        id: ids.firstIngredient,
        name: 'Carrots',
        category: 'Dry',
        default_uom: 'lb',
        active: true,
        description: '',
        storage_notes: '',
        reorder_point: null,
        par_level: null,
        reorder_quantity: null,
        traceability_mode: 'future_required',
      },
      {
        id: ids.secondIngredient,
        name: 'Vinegar',
        category: 'Wet',
        default_uom: 'gal',
        active: true,
        description: '',
        storage_notes: '',
        reorder_point: null,
        par_level: null,
        reorder_quantity: null,
        traceability_mode: 'future_required',
      },
    ],
    suppliers: [{
      id: ids.supplier,
      name: 'Fresh Foods',
      contact_name: '',
      email: '',
      phone: '',
      lead_time_days: 2,
      active: true,
    }],
    supplierItems: [
      {
        id: ids.firstSupplierItem,
        ingredient_id: ids.firstIngredient,
        supplier_id: ids.supplier,
        supplier_sku: 'CARROT-20',
        purchase_uom: 'case',
        pack_quantity: 20,
        pack_quantity_uom: 'lb',
        is_preferred: true,
        active: true,
        notes: '',
      },
      {
        id: ids.secondSupplierItem,
        ingredient_id: ids.secondIngredient,
        supplier_id: ids.supplier,
        supplier_sku: 'VIN-10',
        purchase_uom: 'case',
        pack_quantity: 10,
        pack_quantity_uom: 'gal',
        is_preferred: true,
        active: true,
        notes: '',
      },
    ],
    prices: [
      price('00000000-0000-4000-8000-000000000020', ids.firstSupplierItem, '2026-08-01', 30, 20, 'lb'),
      price('00000000-0000-4000-8000-000000000021', ids.firstSupplierItem, '2026-09-15', 40, 20, 'lb'),
      price('00000000-0000-4000-8000-000000000022', ids.secondSupplierItem, '2026-09-01', 30, 10, 'gal'),
    ],
    customers: [{
      id: ids.customer,
      name: 'Corner Cafe',
      contact_name: '',
      email: '',
      phone: '',
      address: '',
      notes: '',
      revision: 1,
    }],
    customerOptions: [{
      id: ids.option,
      customer_id: ids.customer,
      product_id: ids.product,
      revision: 1,
      label: 'Four-gallon case',
      packaging_mode: 'custom',
      unit_name: 'case',
      gallons_per_unit: 4,
      unit_price: 20,
      currency: 'USD',
      active: true,
      is_preferred: true,
    }],
  };
}

function catalogProduct(input: RecipeCostingSource = source()) {
  const product = buildRecipeCostingCatalog(input)[0];
  if (!product) throw new Error('Expected the product fixture to be mapped.');
  return product;
}

function first<T>(items: T[], fixtureName: string): T {
  const item = items[0];
  if (!item) throw new Error(`Expected ${fixtureName} fixture.`);
  return item;
}

describe('recipe costing domain', () => {
  it('uses the active released recipe and effective preferred supplier prices', () => {
    const product = catalogProduct();
    const result = calculateProductCost(product, '2026-09-30', ids.option);

    expect(result.lines.map((line) => line.ingredientCost)).toEqual([20, 15]);
    expect(result.batchCost).toBe(35);
    expect(result.costPerGallon).toBe(0.875);
    expect(result.packageCost).toBe(3.5);
    expect(result.grossProfit).toBe(16.5);
    expect(result.grossMarginPercent).toBe(82.5);
    expect(result.warnings).toEqual([]);
  });

  it('uses the latest price on or before the selected date', () => {
    const product = catalogProduct();
    const result = calculateProductCost(product, '2026-09-10');

    expect(result.lines[0]?.effectivePrice?.unit_price).toBe(30);
    expect(result.lines[0]?.ingredientCost).toBe(15);
    expect(result.batchCost).toBe(30);
  });

  it('never silently selects a nonpreferred or ambiguous supplier item', () => {
    const nonpreferred = source();
    first(nonpreferred.supplierItems, 'supplier item').is_preferred = false;
    const nonpreferredProduct = catalogProduct(nonpreferred);
    const nonpreferredResult = calculateProductCost(nonpreferredProduct, '2026-09-30');
    expect(nonpreferredResult.batchCost).toBeNull();
    expect(nonpreferredResult.warnings).toContainEqual(expect.objectContaining({
      code: 'missing_preferred_supplier', ingredientName: 'Carrots',
    }));

    const ambiguous = source();
    ambiguous.supplierItems.push({
      ...first(ambiguous.supplierItems, 'supplier item'),
      id: '00000000-0000-4000-8000-000000000030',
      supplier_sku: 'CARROT-ALT',
    });
    const ambiguousProduct = catalogProduct(ambiguous);
    const ambiguousResult = calculateProductCost(ambiguousProduct, '2026-09-30');
    expect(ambiguousResult.batchCost).toBeNull();
    expect(ambiguousResult.warnings).toContainEqual(expect.objectContaining({
      code: 'ambiguous_preferred_supplier', ingredientName: 'Carrots',
    }));
  });

  it('blocks incompatible units and missing as-of prices from aggregate costs', () => {
    const incompatible = source();
    const currentCarrotPrice = incompatible.prices.find((entry) => (
      entry.supplier_item_id === ids.firstSupplierItem && entry.effective_on === '2026-09-15'
    ));
    if (!currentCarrotPrice) throw new Error('Expected current carrot price fixture.');
    currentCarrotPrice.pack_quantity_uom = 'oz';
    const incompatibleProduct = catalogProduct(incompatible);
    const incompatibleResult = calculateProductCost(incompatibleProduct, '2026-09-30');
    expect(incompatibleResult.batchCost).toBeNull();
    expect(incompatibleResult.warnings).toContainEqual(expect.objectContaining({
      code: 'incompatible_uom', recipeUom: 'lb', supplierUom: 'oz',
    }));

    const unpricedProduct = catalogProduct();
    const unpricedResult = calculateProductCost(unpricedProduct, '2026-07-01');
    expect(unpricedResult.batchCost).toBeNull();
    expect(unpricedResult.warnings.filter((warning) => warning.code === 'missing_price'))
      .toHaveLength(2);
  });

  it('requires an active released recipe and does not divide margin by a zero sale price', () => {
    const missingRelease = source();
    first(missingRelease.recipes, 'recipe').active_version_id = null;
    const missingReleaseProduct = catalogProduct(missingRelease);
    expect(calculateProductCost(missingReleaseProduct, '2026-09-30').warnings[0]?.code)
      .toBe('missing_released_recipe');

    const zeroPrice = source();
    first(zeroPrice.customerOptions, 'customer option').unit_price = 0;
    const zeroPriceProduct = catalogProduct(zeroPrice);
    const result = calculateProductCost(zeroPriceProduct, '2026-09-30', ids.option);
    expect(result.grossProfit).toBe(-3.5);
    expect(result.grossMarginPercent).toBeNull();
    expect(result.warnings).toContainEqual({ code: 'zero_sale_price' });
  });
});
