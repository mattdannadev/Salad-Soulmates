import { renderToStaticMarkup } from 'react-dom/server';
import {
  describe, expect, it, vi,
} from 'vitest';
import Home from '../src/app/app/page';

const mocks = vi.hoisted(() => ({ load: vi.fn() }));
vi.mock('../src/lib/dashboard-data', () => ({ default: mocks.load }));
const base = {
  canOrders: true,
  canPurchases: true,
  canStock: true,
  openOrders: [],
  incoming: [],
  suppliers: [],
  stock: [],
  production: [],
};
describe('operations dashboard', () => {
  it.each([
    ['en', 'Welcome, Matt', 'Pickup orders', 'Recently shipped'],
    ['es', 'Bienvenido, Matt', 'Pedidos para recogida', 'Envíos recientes'],
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
});
