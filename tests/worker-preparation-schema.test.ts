import { describe, expect, it } from 'vitest';
import { workerPreparationsSchema } from '../src/domain/worker-preparations';

describe('worker preparation read contract', () => {
  it('retains reported issues returned by the worker RPC', () => {
    const result = workerPreparationsSchema.parse([{
      planned_mixer_batch_id: '00000000-0000-4000-8000-000000000001',
      planned_spice_preparation_id: '00000000-0000-4000-8000-000000000002',
      sequence: 1,
      target_gallons: 40,
      product_name: 'Dressing',
      production_lot_id: '00000000-0000-4000-8000-000000000003',
      production_lot_code: '26126',
      assigned_on: '2026-09-18',
      plan_start_on: '2026-09-18',
      plan_finish_on: '2026-09-19',
      execution_id: '00000000-0000-4000-8000-000000000004',
      status: 'Open',
      lines: [],
      issues: [{
        id: '00000000-0000-4000-8000-000000000005',
        worksheet_line_id: null,
        serialized_unit_id: null,
        category: 'Spice',
        note: 'Wrong lot',
        created_at: '2026-09-18T12:00:00+00:00',
      }],
    }]);
    expect(result[0]?.issues[0]?.note).toBe('Wrong lot');
  });
});
