import {
  beforeEach, describe, expect, it, vi,
} from 'vitest';
import { loadPurchasingWorkspace } from '@/features/purchasing/application/load-purchasing-workspace';
import type {
  PurchasingRepository,
  PurchasingWorkspaceRecords,
} from '@/features/purchasing/application/purchasing-repository';

const id = (value: number) => `00000000-0000-4000-8000-${String(value).padStart(12, '0')}`;
const plan = {
  id: id(1),
  name: 'Customer order',
  needed_on: '2026-10-01',
  batches: [],
  requirements: [],
  status: 'Active' as const,
  created_at: '2026-09-25T12:00:00Z',
};
const records: PurchasingWorkspaceRecords = {
  productionPlans: [{
    id: plan.id,
    start_on: '2026-09-28',
    finish_on: '2026-09-30',
    status: 'Draft',
    revision: 1,
    note: '',
    shortage_reason: '',
    created_at: '2026-09-25T12:00:00Z',
  }],
  productionLots: [],
  orders: [],
  customers: [],
  customerOptions: [],
  plans: [plan],
  receipts: [],
  drafts: [],
  lines: [],
  ingredients: [],
  suppliers: [],
  packs: [],
  products: [],
  recipes: [],
  versions: [],
};

describe('purchasing workspace application service', () => {
  let repository: PurchasingRepository;

  beforeEach(() => {
    repository = {
      loadWorkspaceRecords: vi.fn<PurchasingRepository['loadWorkspaceRecords']>()
        .mockResolvedValue(records),
      loadMaterialRequirements: vi.fn<PurchasingRepository['loadMaterialRequirements']>()
        .mockResolvedValue([{
          ingredient_id: id(2),
          ingredient_name: 'Garlic',
          uom: 'lb',
          required: 5,
          contributions: [],
          on_hand: 2,
          other_commitments: 0,
          confirmed_inbound: 0,
          projected: -3,
          shortage: 3,
        }]),
      loadProductionBatches: vi.fn<PurchasingRepository['loadProductionBatches']>()
        .mockResolvedValue([{
          id: id(3),
          order_id: plan.id,
          product_id: id(4),
          recipe_version_id: id(5),
          sequence: 1,
          target_gallons: 40,
          production_lot_id: null,
          spice_preparation_id: id(6),
        }]),
    };
  });

  it('assembles active-plan calculations through the repository port', async () => {
    const workspace = await loadPurchasingWorkspace(repository, {
      selectedId: plan.id,
      canWrite: true,
      canOrder: true,
      locale: 'en',
    });

    expect(workspace.selected).toEqual(plan);
    expect(workspace.production).toEqual(records.productionPlans[0]);
    expect(workspace.requirements).toEqual([
      expect.objectContaining({ ingredient_name: 'Garlic', shortage: 3 }),
    ]);
    expect(workspace.productionBatches).toHaveLength(1);
    expect(workspace.canOrder).toBe(true);
    expect(repository.loadMaterialRequirements).toHaveBeenCalledWith(plan.id);
    expect(repository.loadProductionBatches).toHaveBeenCalledWith(plan.id);
  });

  it('does not query derived data without an eligible selected record', async () => {
    vi.mocked(repository.loadWorkspaceRecords).mockResolvedValue({
      ...records,
      plans: [{ ...plan, status: 'Cancelled' }],
      productionPlans: [],
    });
    const workspace = await loadPurchasingWorkspace(repository, {
      selectedId: plan.id,
      canWrite: false,
      canOrder: true,
      locale: 'es',
    });

    expect(workspace.requirements).toEqual([]);
    expect(workspace.productionBatches).toEqual([]);
    expect(workspace.canOrder).toBe(false);
    expect(workspace.locale).toBe('es');
    expect(repository.loadMaterialRequirements).not.toHaveBeenCalled();
    expect(repository.loadProductionBatches).not.toHaveBeenCalled();
  });

  it('rejects invalid plan identifiers before accessing persistence', async () => {
    await expect(loadPurchasingWorkspace(repository, {
      selectedId: 'not-a-uuid',
      canWrite: true,
      canOrder: true,
      locale: 'en',
    })).rejects.toThrow();
    expect(repository.loadWorkspaceRecords).not.toHaveBeenCalled();
  });

  it('propagates repository failures instead of returning an empty workspace', async () => {
    vi.mocked(repository.loadWorkspaceRecords).mockRejectedValue(new Error('Database unavailable'));
    await expect(loadPurchasingWorkspace(repository, {
      canWrite: true,
      canOrder: true,
      locale: 'en',
    })).rejects.toThrow('Database unavailable');
  });
});
