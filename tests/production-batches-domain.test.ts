import { describe, expect, it } from 'vitest';
import {
  productionDayEquipmentSelectionSaveSchema,
  productionBatchExecutionSchema,
  productionBatchStartSchema,
} from '@/domain/production-batches';

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('production batch execution read contract', () => {
  it('accepts distinct actual, preparation, and recall identities without quantity assumptions', () => {
    const result = productionBatchExecutionSchema.parse({
      id: uuid('1'),
      organization_id: uuid('2'),
      facility_id: uuid('3'),
      planned_mixer_batch_id: uuid('4'),
      work_order_id: uuid('16'),
      product_id: uuid('5'),
      recipe_version_id: uuid('6'),
      finished_recall_lot_id: uuid('7'),
      local_production_date: '2026-10-01',
      run_sequence: 2,
      run_code: 'RANCH-20261001-0002',
      product_name_snapshot: 'Ranch',
      recipe_name_snapshot: 'Ranch master',
      recipe_version_snapshot: 3,
      preparation_traceability_mode_snapshot: 'batch_specific_allocation',
      mixer_equipment_id: uuid('14'),
      mixer_equipment_code_snapshot: 'MIX-001',
      mixer_equipment_name_snapshot: 'Production mixer',
      mixer_equipment_type_snapshot: 'mixer',
      mixer_usable_capacity_snapshot: 40,
      mixer_usable_capacity_uom_snapshot: 'gal',
      tank_equipment_id: uuid('15'),
      tank_equipment_code_snapshot: 'TANK-001',
      tank_equipment_name_snapshot: 'Primary holding tank',
      tank_equipment_type_snapshot: 'tank',
      tank_usable_capacity_snapshot: 500,
      tank_usable_capacity_uom_snapshot: 'gal',
      expected_yield_quantity: 500,
      expected_yield_uom: 'gal',
      state: 'in_progress',
      started_at: '2026-10-01T14:00:00.000Z',
      completed_at: null,
      idempotency_key: uuid('8'),
      revision: 1,
      created_by: uuid('9'),
      created_at: '2026-10-01T14:00:00.000Z',
      updated_at: '2026-10-01T14:00:00.000Z',
      preparation_traceability_mode: 'batch_specific_allocation',
      preparation_allocations: [{
        id: uuid('10'),
        organization_id: uuid('2'),
        facility_id: uuid('3'),
        production_batch_id: uuid('1'),
        preparation_execution_id: uuid('11'),
        quantity: 12.5,
        uom: 'lb',
        idempotency_key: uuid('12'),
        revision: 1,
        created_by: uuid('9'),
        created_at: '2026-10-01T12:00:00.000Z',
      }],
      preparation_scope: [],
      finished_recall_lot: {
        id: uuid('7'),
        organization_id: uuid('2'),
        facility_id: uuid('3'),
        product_id: uuid('5'),
        local_production_date: '2026-10-01',
        recall_lot_code: 'RANCH-20261001',
        product_name_snapshot: 'Ranch',
        state: 'open',
        idempotency_key: uuid('13'),
        revision: 1,
        created_by: uuid('9'),
        created_at: '2026-10-01T14:00:00.000Z',
        updated_at: '2026-10-01T14:00:00.000Z',
      },
    });

    expect(result.finished_recall_lot?.id).toBe(result.finished_recall_lot_id);
    expect(result.preparation_allocations[0]?.production_batch_id).toBe(result.id);
    expect(result.expected_yield_quantity).toBe(result.tank_usable_capacity_snapshot);
    expect(result.expected_yield_uom).toBe(result.tank_usable_capacity_uom_snapshot);
    expect(result).not.toHaveProperty('actual_yield');
    expect(result).not.toHaveProperty('waste_quantity');
  });

  it('rejects undocumented execution states', () => {
    expect(productionBatchExecutionSchema.shape.state.safeParse('complete').success).toBe(false);
  });

  it('confirms equipment as part of the mixing event before starting a batch', () => {
    expect(productionDayEquipmentSelectionSaveSchema.safeParse({
      local_production_date: '2026-10-01',
      mixer_equipment_id: uuid('14'),
      tank_equipment_id: uuid('15'),
      revision: 0,
    }).success).toBe(true);
    expect(productionBatchStartSchema.parse({
      production_batch_id: uuid('1'),
      mixer_equipment_id: uuid('14'),
      tank_equipment_id: uuid('15'),
      revision: 1,
    })).toEqual({
      production_batch_id: uuid('1'),
      mixer_equipment_id: uuid('14'),
      tank_equipment_id: uuid('15'),
      revision: 1,
    });
    expect(productionBatchStartSchema.safeParse({
      production_batch_id: uuid('1'),
      revision: 0,
    }).success).toBe(false);
  });
});
