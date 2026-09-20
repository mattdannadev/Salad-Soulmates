import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, expect, it, vi,
} from 'vitest';
import Suppliers from '@/app/app/suppliers/page';
import NewSupplier from '@/app/app/suppliers/new/page';
import loadSupplierWorkspace from '@/lib/supplier-data';
import { fixtureId, fixtureRecords } from './browser/fixture-data';

const mocks = vi.hoisted(() => ({ context: vi.fn(), permission: vi.fn(), rows: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.context }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/data', () => ({ rows: mocks.rows }));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  redirect: (path: string) => {
    throw new Error(`REDIRECT:${path}`);
  },
}));
beforeEach(() => {
  vi.clearAllMocks();
  mocks.context.mockResolvedValue({ db: {}, profile: { role: 'admin', preferred_locale: 'en' } });
  mocks.permission.mockResolvedValue(true);
  mocks.rows.mockImplementation((_db: unknown, table: string) => (
    Promise.resolve(fixtureRecords[table] ?? [])
  ));
});
it('makes purchase history primary and keeps contact editing collapsed', async () => {
  const html = renderToStaticMarkup(await Suppliers());
  expect(html).toContain('<details class="supplier-orders">');
  expect(html).toContain('aria-label="Supplier directory"');
  expect(html).toContain('href="/app/suppliers/new"');
  expect(html).toContain('<th>Open purchase orders</th>');
  expect(html).toContain('<details class="supplier-profile">');
  expect(html).toContain('No purchase orders for this supplier yet.');
  expect(html).toContain('Outstanding orders by customer');
  expect(html).toContain(`/app/purchasing?supplier=${fixtureId(200)}`);
  expect(html.indexOf('Recent purchase orders')).toBeLessThan(html.indexOf('Supplier contact'));
});
it('keeps the catalog readable without loading purchase records for restricted viewers', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'inventory.read'));
  const html = renderToStaticMarkup(await Suppliers());
  expect(html).toContain('Purchase orders are unavailable with your access.');
  expect(html).not.toContain('New purchase order');
  expect(mocks.rows).toHaveBeenCalledTimes(1);
  expect(mocks.rows).toHaveBeenCalledWith(expect.anything(), 'suppliers', expect.anything());
});
it('enforces catalog access before any records are loaded and propagates read errors', async () => {
  mocks.permission.mockResolvedValue(false);
  await expect(loadSupplierWorkspace()).rejects.toThrow('REDIRECT:/app');
  expect(mocks.rows).not.toHaveBeenCalled();
  mocks.permission.mockResolvedValue(true);
  mocks.rows.mockRejectedValue(new Error('READ_FAILED'));
  await expect(loadSupplierWorkspace()).rejects.toThrow('READ_FAILED');
});
it('hides write controls for read-only viewers and inactive suppliers', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(!permission.endsWith('.write')));
  expect(renderToStaticMarkup(await Suppliers())).not.toContain('New purchase order');
  mocks.permission.mockResolvedValue(true);
  mocks.rows.mockImplementation((_db: unknown, table: string) => Promise.resolve(table === 'suppliers'
    ? [{ ...fixtureRecords.suppliers?.[0], active: false }] : []));
  const html = renderToStaticMarkup(await Suppliers());
  expect(html).not.toContain('New purchase order');
  expect(html).toContain('Inactive supplier: order history only.');
});
it('translates supplier workflow labels according to the account language', async () => {
  mocks.context.mockResolvedValue({ db: {}, profile: { role: 'admin', preferred_locale: 'es' } });
  const html = renderToStaticMarkup(await Suppliers());
  expect(html).toContain('Pedidos de compra recientes');
  expect(html).toContain('Pedidos pendientes por cliente');
  expect(html).toContain('Nueva orden de compra');
});

it('provides a dedicated creation form only to supplier editors', async () => {
  expect(renderToStaticMarkup(await NewSupplier())).toContain('Supplier name');
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(permission !== 'master_data.write'));
  await expect(NewSupplier()).rejects.toThrow('REDIRECT:/app/suppliers');
  expect(renderToStaticMarkup(await Suppliers())).not.toContain('href="/app/suppliers/new"');
});
