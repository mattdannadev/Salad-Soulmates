import { renderToStaticMarkup } from 'react-dom/server';
import { createElement, type ReactNode } from 'react';
import {
  beforeEach, expect, it, vi,
} from 'vitest';
import Purchasing from '@/app/app/purchasing/page';
import { purchaseDraftRowSchema, purchaseLineRowSchema } from '@/domain/purchasing';
import { fixtureId, fixtureRecords } from './browser/fixture-data';

const mocks = vi.hoisted(() => ({ workspace: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/purchasing-data', () => ({ default: mocks.workspace }));
vi.mock('@/components/creation-dialog', () => ({
  default: ({
    open, title, description, children,
  }: {
    open: boolean; title: string; description?: string; children: ReactNode;
  }) => (
    open ? createElement('dialog', { open, 'aria-label': title }, description, children) : null
  ),
}));
vi.mock('next/navigation', () => ({
  useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }),
  notFound: () => {
    throw new Error('NOT_FOUND');
  },
}));
const draft = purchaseDraftRowSchema.parse({
  id: fixtureId(600),
  material_plan_id: fixtureId(601),
  supplier_id: fixtureId(200),
  expected_on: '2026-10-01',
  status: 'Confirmed',
  reference: 'PO-100',
  note: '',
  revision: 2,
  created_at: '2026-09-20T12:00:00Z',
});
const line = purchaseLineRowSchema.parse({
  id: fixtureId(602),
  purchase_draft_id: draft.id,
  ingredient_id: fixtureId(100),
  supplier_item_id: fixtureId(210),
  ingredient_name: 'Preview garlic powder',
  supplier_sku: 'GARLIC',
  uom: 'lb',
  purchase_uom: 'pail',
  pack_quantity: 30,
  raw_shortage: 40,
  recommended_units: 2,
  purchase_units: 2,
  quantity: 60,
  override_reason: '',
});
const garlicPack = {
  id: fixtureId(210),
  supplier_id: fixtureId(200),
  ingredient_id: fixtureId(100),
  supplier_sku: 'GARLIC',
  purchase_uom: 'pail',
  pack_quantity: 30,
  pack_quantity_uom: 'lb',
  is_preferred: true,
  active: true,
  notes: '',
};
const lemonPack = {
  id: fixtureId(211),
  supplier_id: fixtureId(200),
  ingredient_id: fixtureId(101),
  supplier_sku: 'LEMON',
  purchase_uom: 'case',
  pack_quantity: 5,
  pack_quantity_uom: 'gal',
  is_preferred: true,
  active: true,
  notes: '',
};
beforeEach(() => {
  vi.clearAllMocks();
  mocks.workspace.mockResolvedValue({
    orders: [],
    plans: [],
    drafts: [draft],
    lines: [line],
    receipts: [],
    suppliers: fixtureRecords.suppliers,
    packs: [],
    ingredients: fixtureRecords.ingredients,
    requirements: [],
    canWrite: true,
    locale: 'en',
  });
});
it('preserves recorded purchasing packs, quantities, dates and status controls', async () => {
  const html = renderToStaticMarkup(await Purchasing({ searchParams: Promise.resolve({}) }));
  expect(html).toContain('Preview supplier');
  expect(html).toContain('PO-100');
  expect(html).toContain('Confirmed');
  expect(html).toContain('Oct 1, 2026');
  expect(html).toContain('Preview garlic powder');
  expect(html).toContain('30 lb/pail');
  expect(html).toContain('2 pail = 60 lb');
  expect(html).toContain('Update status');
  expect(html).toContain(`/app/orders?estimate=${draft.material_plan_id}`);
  expect(html).toContain('New purchase order');
  expect(html).toContain('href="/app/purchasing?create=1"');
  expect(html).not.toContain('<dialog');
  expect(html).not.toContain('Standalone supplier purchase');
  expect(html).not.toContain('Create draft for');
});

it('opens a standalone purchase composer from the page-level creation action', async () => {
  mocks.workspace.mockResolvedValue({
    orders: [],
    plans: [],
    drafts: [],
    lines: [],
    receipts: [],
    suppliers: fixtureRecords.suppliers,
    packs: [garlicPack, lemonPack],
    ingredients: fixtureRecords.ingredients,
    requirements: [],
    canWrite: true,
    locale: 'en',
  });

  const html = renderToStaticMarkup(
    await Purchasing({
      searchParams: Promise.resolve({ create: '1' }),
    }),
  );

  expect(html).toContain('<dialog');
  expect(html).toContain('Standalone supplier purchase');
  expect(html).toContain('Create purchase order');
});

it.each([
  { supplier: 'invalid' },
  { supplier: [fixtureId(200), fixtureId(201)] },
  { supplier: fixtureId(999) },
  { ingredient: 'invalid' },
  { ingredient: [fixtureId(100), fixtureId(101)] },
  { ingredient: fixtureId(999) },
])('rejects invalid contextual filter $supplier$ingredient', async (searchParams) => {
  await expect(Purchasing({ searchParams: Promise.resolve(searchParams) })).rejects.toThrow(
    'NOT_FOUND',
  );
});
it('fixes an inventory-selected ingredient and offers only its compatible suppliers', async () => {
  const garlicId = fixtureId(100);
  mocks.workspace.mockResolvedValue({
    orders: [],
    plans: [],
    drafts: [],
    lines: [],
    receipts: [],
    suppliers: [
      ...(fixtureRecords.suppliers ?? []),
      { ...fixtureRecords.suppliers?.[0], id: fixtureId(201), name: 'Lemon-only supplier' },
    ],
    packs: [
      garlicPack,
      {
        ...lemonPack,
        supplier_id: fixtureId(201),
      },
    ],
    ingredients: fixtureRecords.ingredients,
    requirements: [],
    canWrite: true,
    locale: 'en',
  });
  const html = renderToStaticMarkup(
    await Purchasing({
      searchParams: Promise.resolve({ ingredient: garlicId, create: '1' }),
    }),
  );
  expect(html).toContain('Selected ingredient: Preview garlic powder');
  expect(html).toContain('The ingredient is fixed.');
  expect(html).toContain('Preview supplier');
  expect(html).toContain('Preview garlic powder');
  expect(html).not.toContain('Lemon-only supplier');
  expect(html).not.toContain('Preview lemon juice');
  expect(html).not.toContain('Customer order (optional)');
});
it('keeps a supplier fixed while offering each configured ingredient', async () => {
  mocks.workspace.mockResolvedValue({
    orders: [],
    plans: [],
    drafts: [],
    lines: [],
    receipts: [],
    suppliers: fixtureRecords.suppliers,
    packs: [garlicPack, lemonPack],
    ingredients: fixtureRecords.ingredients,
    requirements: [],
    canWrite: true,
    locale: 'en',
  });
  const html = renderToStaticMarkup(
    await Purchasing({
      searchParams: Promise.resolve({ supplier: fixtureId(200), create: '1' }),
    }),
  );
  expect(html).toContain('Selected supplier: Preview supplier');
  expect(html).toContain('Preview garlic powder');
  expect(html).toContain('Preview lemon juice');
  expect(html).toContain('Whole packs (0 skips this ingredient)');
});
it('preserves supplier scope and directory filters in the creation action', async () => {
  const html = renderToStaticMarkup(
    await Purchasing({
      searchParams: Promise.resolve({ supplier: fixtureId(200), q: 'PO-100', status: 'Confirmed' }),
    }),
  );
  expect(html).toContain(
    `href="/app/purchasing?supplier=${fixtureId(200)}&amp;q=PO-100&amp;status=Confirmed&amp;create=1"`,
  );
  expect(html).not.toContain('<dialog');
});
it('does not expose purchase creation for a read-only user even with creation URL state', async () => {
  mocks.workspace.mockResolvedValue({
    orders: [],
    plans: [],
    drafts: [draft],
    lines: [line],
    receipts: [],
    suppliers: fixtureRecords.suppliers,
    packs: [],
    ingredients: fixtureRecords.ingredients,
    requirements: [],
    canWrite: false,
    locale: 'en',
  });
  const html = renderToStaticMarkup(
    await Purchasing({ searchParams: Promise.resolve({ create: '1' }) }),
  );
  expect(html).not.toContain('New purchase order');
  expect(html).not.toContain('<dialog');
});
it('shows only the selected supplier’s history', async () => {
  mocks.workspace.mockResolvedValue({
    orders: [],
    plans: [],
    drafts: [
      draft,
      {
        ...draft,
        id: fixtureId(700),
        supplier_id: fixtureId(201),
        reference: 'OTHER-PO',
      },
    ],
    lines: [line],
    receipts: [],
    suppliers: [
      ...(fixtureRecords.suppliers ?? []),
      { ...fixtureRecords.suppliers?.[0], id: fixtureId(201), name: 'Other supplier' },
    ],
    packs: [],
    ingredients: fixtureRecords.ingredients,
    requirements: [],
    canWrite: true,
    locale: 'en',
  });
  const page = await Purchasing({ searchParams: Promise.resolve({ supplier: fixtureId(200) }) });
  const html = renderToStaticMarkup(page);
  expect(html).toContain('PO-100');
  expect(html).not.toContain('OTHER-PO');
  expect(html).not.toContain('Other supplier');
});
