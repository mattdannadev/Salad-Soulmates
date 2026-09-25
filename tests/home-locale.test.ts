import { renderToStaticMarkup } from 'react-dom/server';
import {
  describe, expect, it, vi,
} from 'vitest';
import Home from '../src/app/app/page';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/lib/dashboard-data', () => ({ default: mocks.load }));
vi.mock('../src/components/demand-purchase-button', () => ({ default: () => null }));
vi.mock('../src/domain/format', async (original) => ({
  ...await original<typeof import('../src/domain/format')>(), facilityDate: () => '2026-09-20',
}));
const base = {
  canOrders: true,
  canPurchases: true,
  canStock: true,
  canCoverage: true,
  coverage: [],
  openOrders: [],
  incoming: [],
  suppliers: [],
  stock: [],
  production: [],
};
describe('operations dashboard', () => {
  it.each([
    ['en', 'Welcome, Matt', 'Upcoming pickups', 'Recently shipped'],
    ['es', 'Bienvenido, Matt', 'Próximas recogidas', 'Envíos recientes'],
  ])('uses the saved %s preference', async (locale, greeting, pickups, shipped) => {
    mocks.load.mockResolvedValue({
      ...base,
      profile: { display_name: 'Matt Danna', preferred_locale: locale },
    });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain(greeting);
    expect(html).toContain(pickups);
    expect(html).toContain(shipped);
  });
  it('shows each product batch count and the order total without claiming drafts shipped', async () => {
    mocks.load.mockResolvedValue({
      ...base,
      profile: { display_name: 'Matt', preferred_locale: 'en' },
      openOrders: [{
        id: 'test-order',
        customer_name: 'Test customer',
        needed_on: '2026-10-01',
        reference: 'TEST',
        items: [
          { product_id: 'italian', product_name: 'Italian dressing', batch_count: 4 },
          { product_id: 'ranch', product_name: 'Ranch dressing', batch_count: 2 },
        ],
      }],
    });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain('Italian dressing');
    expect(html).toContain('4 batches');
    expect(html).toContain('Ranch dressing');
    expect(html).toContain('2 batches');
    expect(html).toContain('6 total batches');
    expect(html).toContain('Shipment confirmation is not available yet');
    expect(html).toContain('/app/orders?order=test-order');
  });
  it('propagates failed reads instead of showing false empty operations', async () => {
    mocks.load.mockRejectedValue(new Error('Read failed'));
    await expect(Home()).rejects.toThrow('Read failed');
  });
  it('surfaces due work with working detail anchors while keeping future pickups separate', async () => {
    const order = {
      id: 'due-order', customer_name: 'Today customer', needed_on: '2026-09-20', items: [],
    };
    mocks.load.mockResolvedValue({
      ...base,
      profile: { display_name: 'Matt', preferred_locale: 'en' },
      openOrders: [order, { ...order, id: 'late-order', needed_on: '2026-09-19' }],
      incoming: [{
        id: 'purchase',
        expected_on: '2026-09-20',
        reference: 'PO-1',
        supplier_id: 'supplier',
        material_plan_id: 'due-order',
        progress: { status: 'Confirmed', balances: [] },
      }],
      coverage: [{
        ingredientId: 'ingredient',
        name: 'Lemon juice',
        uom: 'gal',
        demand: 4,
        usable: 2,
        inbound: 0,
        shortage: 2,
        supplyDate: '2026-09-20',
        demandByDate: 4,
        planId: 'due-order',
        neededOn: '2026-09-20',
      }],
    });
    const html = renderToStaticMarkup(await Home());
    const priorities = html.slice(html.indexOf('class="dashboard-priorities"'), html.indexOf('class="dashboard-columns"'));
    expect(priorities).toContain('1 due today · 1 past pickup date');
    expect(priorities).toContain('Expected today or earlier: 1');
    expect(priorities).toContain('Ingredients below demand: 1');
    expect(priorities).toContain('Orders awaiting confirmed preparation: 2');
    ['supplier-arrivals', 'ingredient-demand', 'order-preparation'].forEach((id) => {
      expect(priorities).toContain(`href="#${id}"`);
      expect(html).toContain(`id="${id}"`);
    });
    expect(priorities).toContain('href="/app/orders"');
  });
  it('does not show unavailable metrics or a misleading all-clear to restricted users', async () => {
    mocks.load.mockResolvedValue({
      ...base,
      canOrders: false,
      canPurchases: false,
      canCoverage: false,
      profile: { display_name: 'Matt', preferred_locale: 'en' },
    });
    const html = renderToStaticMarkup(await Home());
    expect(html).not.toContain('class="dashboard-metric"');
    expect(html).not.toContain('href="#ingredient-demand"');
    expect(html).not.toContain('No items to review right now');
    expect(html).toContain('You do not have access to these records.');
  });
  it.each([
    ['en', 'No items to review right now'],
    ['es', 'Sin pendientes que revisar'],
  ])('shows a localized empty priority queue in %s', async (locale, emptyLabel) => {
    mocks.load.mockResolvedValue({
      ...base,
      profile: { display_name: 'Matt', preferred_locale: locale },
    });
    const html = renderToStaticMarkup(await Home());
    expect(html).toContain(emptyLabel);
    expect(html).not.toContain('class="dashboard-priority ');
  });
});

it('shows all future pickups in date order, excluding today and overdue orders', async () => {
  const orders = Array.from({ length: 9 }, (_, index) => ({
    id: `order-${index}`,
    customer_name: `Customer ${index}`,
    reference: '',
    items: [],
    needed_on: `2026-10-${String(index + 1).padStart(2, '0')}`,
  }));
  mocks.load.mockResolvedValue({
    ...base,
    profile: { display_name: 'Matt', preferred_locale: 'en' },
    openOrders: [...orders.toReversed(),
      {
        ...orders[0], id: 'past', customer_name: 'Past customer', needed_on: '2026-09-19',
      },
      {
        ...orders[0], id: 'today', customer_name: 'Today customer', needed_on: '2026-09-20',
      }],
  });
  const html = renderToStaticMarkup(await Home());
  const pickups = html.slice(html.indexOf('dashboard-pickups'), html.indexOf('SUPPLIER ARRIVALS'));
  expect(pickups).not.toContain('Past customer');
  expect(pickups).not.toContain('Today customer');
  expect(pickups).toContain('Customer 8');
  expect(pickups.indexOf('Customer 0')).toBeLessThan(pickups.indexOf('Customer 8'));
});
