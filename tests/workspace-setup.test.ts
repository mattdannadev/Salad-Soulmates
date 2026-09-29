import {
  beforeEach, expect, it, vi,
} from 'vitest';
import { createClient } from '@supabase/supabase-js';
import type { Database } from '@/lib/database.types';
import loadSetupSteps from '@/services/workspace-setup';

const mocks = vi.hoisted(() => ({ count: vi.fn() }));
vi.mock('@/lib/setup-data', () => ({ countSetupRows: mocks.count }));

beforeEach(() => {
  vi.clearAllMocks();
  mocks.count.mockResolvedValue(0);
});

const db = createClient<Database>('https://example.supabase.co', 'test-key');

it('checks milestones in setup order and distinguishes missing records', async () => {
  mocks.count.mockImplementation((_db: unknown, table: string) => Promise.resolve(
    table === 'supplier_items' || table === 'recipe_versions' ? 0 : 1,
  ));
  const steps = await loadSetupSteps(db, {
    master: true,
    masterWrite: true,
    products: true,
    productsWrite: true,
    orderWorkspace: true,
    ordersWrite: true,
  });
  expect(steps.map((step) => [step.id, step.state])).toEqual([
    ['ingredients', 'ready'],
    ['suppliers', 'missing'],
    ['products', 'missing'],
    ['pricing', 'ready'],
    ['orders', 'ready'],
  ]);
  expect(steps[1]?.counts).toEqual([1, 0]);
});

it('never queries inaccessible setup categories', async () => {
  const steps = await loadSetupSteps(db, {
    master: false,
    masterWrite: false,
    products: false,
    productsWrite: false,
    orderWorkspace: false,
    ordersWrite: false,
  });
  expect(steps.every((step) => step.state === 'denied')).toBe(true);
  expect(mocks.count).not.toHaveBeenCalled();
});

it('isolates a failed milestone instead of presenting it as empty', async () => {
  mocks.count.mockImplementation((_db: unknown, table: string) => (
    table === 'supplier_items' ? Promise.reject(new Error('Offline')) : Promise.resolve(1)
  ));
  const steps = await loadSetupSteps(db, {
    master: true,
    masterWrite: true,
    products: true,
    productsWrite: true,
    orderWorkspace: true,
    ordersWrite: true,
  });
  expect(steps.find((step) => step.id === 'suppliers')?.state).toBe('error');
  expect(steps.find((step) => step.id === 'ingredients')?.state).toBe('ready');
});

it('keeps readable progress visible without offering a write action', async () => {
  const steps = await loadSetupSteps(db, {
    master: true,
    masterWrite: false,
    products: false,
    productsWrite: false,
    orderWorkspace: false,
    ordersWrite: false,
  });
  expect(steps.find((step) => step.id === 'ingredients')).toMatchObject({
    state: 'missing', counts: [0], canAct: false,
  });
});
