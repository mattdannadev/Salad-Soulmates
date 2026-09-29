import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, expect, it, vi,
} from 'vitest';
import Inventory from '@/app/app/inventory/page';
import { fixtureId, fixtureRecords } from './browser/fixture-data';

const activeInventorySearch = { searchParams: Promise.resolve({ status: 'active' }) };

const mocks = vi.hoisted(() => ({
  context: vi.fn(),
  permission: vi.fn(),
  rows: vi.fn(),
}));

vi.mock('server-only', () => ({}));
vi.mock('@/lib/auth', () => ({ requireAdminShell: mocks.context }));
vi.mock('@/lib/permissions', () => ({ default: mocks.permission }));
vi.mock('@/lib/data', async (original) => ({
  ...await original<typeof import('@/lib/data')>(),
  rows: mocks.rows,
}));
vi.mock('@/components/inventory-form', () => ({ default: () => null }));

beforeEach(() => {
  vi.clearAllMocks();
  const db = {
    from: vi.fn(() => ({
      select: vi.fn(() => ({
        eq: vi.fn(() => ({
          single: vi.fn().mockResolvedValue({ data: { name: 'Test facility' }, error: null }),
        })),
      })),
    })),
  };
  mocks.context.mockResolvedValue({
    db,
    profile: { facility_id: fixtureId(11), role: 'reviewer' },
  });
  mocks.permission.mockResolvedValue(true);
  mocks.rows.mockImplementation((_db: unknown, table: string) => Promise.resolve(
    table === 'ingredients' ? fixtureRecords.ingredients : [],
  ));
});

it('starts a purchase from an active inventory ingredient when purchase access is complete', async () => {
  const html = renderToStaticMarkup(await Inventory(activeInventorySearch));
  expect(html).toContain(`href="/app/purchasing?ingredient=${fixtureId(100)}"`);
  expect(html).toContain(`href="/app/purchasing?ingredient=${fixtureId(100)}">Purchase</a>`);
  expect(html).toContain('<th scope="col">Reorder point</th>');
  expect(html).toContain('<th scope="col">Par level</th>');
  expect(html).toContain('Not set');
  expect(html).not.toContain('At or below reorder point');
  expect(html).not.toContain('<th scope="col">Status</th>');
  expect(html).not.toContain('Search this table');
  expect(html).toContain('<button type="button">Record inventory adjustment</button>');
});

it('does not offer purchase initiation when any required permission is missing', async () => {
  mocks.permission.mockImplementation((_db: unknown, permission: string) => Promise.resolve(
    permission !== 'planning.write',
  ));
  const html = renderToStaticMarkup(await Inventory(activeInventorySearch));
  expect(html).not.toContain('/app/purchasing?ingredient=');
  expect(html).not.toContain('<th scope="col">Purchase</th>');
});

it('shows a zero reorder point while treating missing legacy thresholds as unset', async () => {
  const [garlic, lemon] = fixtureRecords.ingredients ?? [];
  if (!garlic || !lemon) throw new Error('Ingredient fixtures are required');
  mocks.rows.mockImplementation((_db: unknown, table: string) => Promise.resolve(
    table === 'ingredients'
      ? [{ ...garlic, reorder_point: 0, par_level: 5 }, lemon]
      : [],
  ));
  const html = renderToStaticMarkup(await Inventory(activeInventorySearch));
  expect(html).toContain('0 lb');
  expect(html).toContain('5 lb');
  expect(html).toContain('At or below reorder point');
  expect(html).toContain('Not set');
});
