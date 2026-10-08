import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { expect, it, vi } from 'vitest';
import PurchaseComposer, {
  calculatePurchaseAdjustment,
  parsePurchaseUnits,
  purchaseOverrideReason,
} from '@/components/purchase-composer';

vi.mock('@/app/actions', () => ({ saveRecord: vi.fn() }));
vi.mock('@/app/purchasing-actions', () => ({ default: vi.fn() }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
}));

const ingredientId = '00000000-0000-4000-8000-000000000001';
const supplierId = '00000000-0000-4000-8000-000000000002';
const packId = '00000000-0000-4000-8000-000000000003';
const props = {
  planId: '00000000-0000-4000-8000-000000000004',
  neededOn: '2026-10-12',
  requirements: [{
    ingredient_id: ingredientId,
    ingredient_name: 'Test garlic',
    uom: 'lb',
    required: 100,
    contributions: [],
    on_hand: 25,
    other_commitments: 0,
    confirmed_inbound: 15,
    projected: -60,
    shortage: 60,
  }],
  packs: [{
    id: packId,
    ingredient_id: ingredientId,
    supplier_id: supplierId,
    supplier_sku: 'GARLIC-30',
    purchase_uom: 'pail',
    pack_quantity: 30,
    pack_quantity_uom: 'lb',
    is_preferred: true,
    active: true,
    notes: '',
  }],
  suppliers: [{
    id: supplierId,
    name: 'Test supplier',
    contact_name: '',
    email: '',
    phone: '',
    lead_time_days: 2,
    active: true,
  }],
  existingSuppliers: [],
  supplierPrices: [],
};

it('shows the complete review before offering a supplier purchase draft', () => {
  const html = renderToStaticMarkup(createElement(PurchaseComposer, {
    ...props,
    locale: 'en',
  }));

  expect(html).toContain('Required: 100 lb');
  expect(html).toContain('1. Select ingredients to buy');
  expect(html).toContain('2. Review supplier recommendations');
  expect(html).toContain('3. Change supplier or pack recommendations');
  expect(html.indexOf('1. Select ingredients to buy')).toBeLessThan(
    html.indexOf('2. Review supplier recommendations'),
  );
  expect(html.indexOf('2. Review supplier recommendations')).toBeLessThan(
    html.indexOf('3. Change supplier or pack recommendations'),
  );
  expect(html).toContain('Test supplier · 1 ingredient');
  expect(html).toContain('Change supplier or pack recommendations');
  expect(html).toContain('On hand: 25 lb');
  expect(html).toContain('Confirmed inbound: 15 lb');
  expect(html).toContain('Raw shortage: 60 lb');
  expect(html).toContain('Recommended quantity: 2 pail = 60 lb');
  expect(html).toContain('Order now');
  expect(html).toContain('Ordered base quantity: 60 lb');
  expect(html).toContain('Matches the raw shortage');
  expect(html).toContain('The draft does not place the order with the supplier.');
  expect(html).toContain('Create purchase draft for Test supplier');
  expect(html).not.toContain('Explain why Order now differs');
});

it('renders the review-first purchase copy in Spanish', () => {
  const html = renderToStaticMarkup(createElement(PurchaseComposer, {
    ...props,
    locale: 'es',
  }));

  expect(html).toContain('Cantidad recomendada: 2 pail = 60 lb');
  expect(html).toContain('Pedir ahora');
  expect(html).toContain('Cantidad base pedida: 60 lb');
  expect(html).toContain('Cubre exactamente el faltante base');
  expect(html).toContain('Crear borrador de compra para Test supplier');
});

it('treats empty, fractional and out-of-range quantities as incomplete input', () => {
  expect(parsePurchaseUnits('')).toBeNull();
  expect(parsePurchaseUnits('1.5')).toBeNull();
  expect(parsePurchaseUnits('0')).toBeNull();
  expect(parsePurchaseUnits('1000001')).toBeNull();
  expect(parsePurchaseUnits('2')).toBe(2);
});

it('uses scaled arithmetic for exact quantity differences', () => {
  expect(calculatePurchaseAdjustment(0.3, 0.1, 3)).toEqual({
    orderedQuantity: 0.3,
    difference: 0,
  });
  expect(calculatePurchaseAdjustment(60, 30, null)).toBeNull();
});

it('omits stale reasons at the recommendation and trims real overrides', () => {
  expect(purchaseOverrideReason(2, 2, ' stale reason ')).toBe('');
  expect(purchaseOverrideReason(1, 2, ' use stock first ')).toBe('use stock first');
});
