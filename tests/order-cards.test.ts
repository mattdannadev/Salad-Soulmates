import { describe, expect, it } from 'vitest';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import OrderCardDetails from '@/components/order-card-details';
import { customerOrderRowSchema } from '@/domain/customer-orders';
import { customerRowSchema } from '@/domain/customer-pricing';
import { materialPlanRowSchema } from '@/domain/purchasing';
import { productionPlanSchema } from '@/domain/production';
import orderCards from '@/services/order-cards';

const id = (suffix: number) => `00000000-0000-4000-8000-${String(suffix).padStart(12, '0')}`;

function order(suffix: number, createdAt: string) {
  const product = { product_id: id(300), customer_product_option_id: null, batch_count: 2 };
  return customerOrderRowSchema.parse({
    id: id(suffix),
    customer_id: id(100),
    customer_name: 'River Cafe',
    reference: `PO-${suffix}`,
    needed_on: '2026-10-15',
    created_at: createdAt,
    products: [product],
    items: [{
      ...product,
      product_name: 'House Dressing',
      recipe_version_id: id(400),
      version_number: 1,
      batch_gallons: 40,
      packaging_label: '2 gallon bag',
      unit_name: 'bag',
      gallons_per_unit: 2,
      unit_price: 12.5,
      currency: 'USD',
      unit_count: 40,
      line_total: 500,
    }],
  });
}

describe('saved order cards', () => {
  it('joins current customer notes and planning state without changing saved products', () => {
    const older = order(800, '2026-09-20T10:00:00Z');
    const newer = order(801, '2026-09-21T10:00:00Z');
    const customer = customerRowSchema.parse({
      id: id(100), name: 'River Cafe', notes: 'Call at loading dock',
    });
    const plan = materialPlanRowSchema.parse({
      id: older.id,
      name: 'Order',
      needed_on: older.needed_on,
      batches: [],
      requirements: [],
      status: 'Cancelled',
      created_at: older.created_at,
    });
    const production = productionPlanSchema.parse({
      id: newer.id,
      start_on: '2026-10-12',
      finish_on: '2026-10-14',
      status: 'Draft',
      revision: 1,
      note: '',
      shortage_reason: '',
      created_at: newer.created_at,
    });

    const cards = orderCards([older, newer], [customer], [plan], [production]);

    expect(cards.map(({ order: item }) => item.id)).toEqual([newer.id, older.id]);
    expect(cards[0]).toMatchObject({
      customerNotes: 'Call at loading dock',
      status: 'Active',
      productionStart: '2026-10-12',
      order: { items: [{ product_name: 'House Dressing', batch_count: 2 }] },
    });
    expect(cards[1]).toMatchObject({ status: 'Cancelled', productionStart: null });
  });

  it('shows no customer note or production date when neither record exists', () => {
    expect(orderCards([order(800, '2026-09-20T10:00:00Z')], [], [], [])[0])
      .toMatchObject({ customerNotes: '', productionStart: null });
  });

  it('renders the order dates, saved product batches, and current customer notes', () => {
    const card = orderCards([order(800, '2026-09-20T10:00:00Z')], [customerRowSchema.parse({
      id: id(100), name: 'River Cafe', notes: 'Call at loading dock',
    })], [], [])[0];
    if (!card) throw new Error('Expected a saved order card');
    const markup = renderToStaticMarkup(createElement(OrderCardDetails, { card, locale: 'en' }));

    expect(markup).toContain('Order placed');
    expect(markup).toContain('Sep 20, 2026');
    expect(markup).toContain('Customer pickup');
    expect(markup).toContain('Oct 15, 2026');
    expect(markup).toContain('House Dressing');
    expect(markup).toContain('2 batches');
    expect(markup).toContain('2 total batches');
    expect(markup).toContain('Call at loading dock');
  });

  it('renders every saved product and the missing-notes fallback in both locales', () => {
    const first = order(800, '2026-09-20T10:00:00Z');
    const secondProduct = {
      ...first.products[0], product_id: id(301), batch_count: 3,
    };
    const multipleProducts = customerOrderRowSchema.parse({
      ...first,
      products: [...first.products, secondProduct],
      items: [...first.items, {
        ...first.items[0],
        ...secondProduct,
        product_name: 'Garden Dressing',
        unit_count: 60,
        line_total: 750,
      }],
    });
    const card = orderCards([multipleProducts], [], [], [])[0];
    if (!card) throw new Error('Expected a saved order card');
    const english = renderToStaticMarkup(createElement(OrderCardDetails, { card, locale: 'en' }));
    const spanish = renderToStaticMarkup(createElement(OrderCardDetails, { card, locale: 'es' }));

    expect(english).toContain('House Dressing');
    expect(english).toContain('Garden Dressing');
    expect(english).toContain('2 batches');
    expect(english).toContain('3 batches');
    expect(english).toContain('5 total batches');
    expect(english).toContain('Customer notes');
    expect(english).toContain('No notes');
    expect(spanish).toContain('2 lotes');
    expect(spanish).toContain('3 lotes');
    expect(spanish).toContain('5 lotes en total');
    expect(spanish).toContain('Notas del cliente');
    expect(spanish).toContain('Sin notas');
  });
});
