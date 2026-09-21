import { renderToStaticMarkup } from 'react-dom/server';
import {
  beforeEach, expect, it, vi,
} from 'vitest';
import Purchasing from '@/app/app/purchasing/page';
import { purchaseDraftRowSchema, purchaseLineRowSchema } from '@/domain/purchasing';
import { fixtureId, fixtureRecords } from './browser/fixture-data';

const mocks = vi.hoisted(() => ({ workspace: vi.fn() }));
vi.mock('server-only', () => ({}));
vi.mock('@/lib/purchasing-data', () => ({ default: mocks.workspace }));
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
  expect(html).not.toContain('Standalone supplier purchase');
  expect(html).not.toContain('Create draft for');
});

it.each([
  { supplier: 'invalid' },
  { supplier: [fixtureId(200), fixtureId(201)] },
  { supplier: fixtureId(999) },
  { ingredient: 'invalid' },
  { ingredient: [fixtureId(100), fixtureId(101)] },
  { ingredient: fixtureId(999) },
])('rejects invalid contextual filter $supplier$ingredient', async (searchParams) => {
  await expect(Purchasing({ searchParams: Promise.resolve(searchParams) }))
    .rejects.toThrow('NOT_FOUND');
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
  const html = renderToStaticMarkup(await Purchasing({
    searchParams: Promise.resolve({ ingredient: garlicId }),
  }));
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
  const html = renderToStaticMarkup(await Purchasing({
    searchParams: Promise.resolve({ supplier: fixtureId(200) }),
  }));
  expect(html).toContain('Selected supplier: Preview supplier');
  expect(html).toContain('Preview garlic powder');
  expect(html).toContain('Preview lemon juice');
  expect(html).toContain('Whole packs (0 skips this ingredient)');
});
it('shows only the selected supplier’s history', async () => {
  mocks.workspace.mockResolvedValue({
    orders: [],
    plans: [],
    drafts: [draft, {
      ...draft, id: fixtureId(700), supplier_id: fixtureId(201), reference: 'OTHER-PO',
    }],
    lines: [line],
    receipts: [],
    suppliers: [
      ...fixtureRecords.suppliers ?? [], { ...fixtureRecords.suppliers?.[0], id: fixtureId(201), name: 'Other supplier' },
    ],
    packs: [],
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
