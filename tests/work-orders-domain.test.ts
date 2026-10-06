import { describe, expect, it } from 'vitest';
import { createWorkOrderSchema, linkExecutionWorkOrderSchema, productionBatchMixingStartSchema } from '@/domain/work-orders';

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('work-order contracts', () => {
  it('reuses the operational work contract for mixing staffing and batch plans', () => {
    expect(createWorkOrderSchema.parse({
      id: uuid('1'),
      facility_id: uuid('2'),
      work_on: '2026-10-01',
      kind: 'mixing',
      batch_quota: 5,
      estimated_minutes: 180,
      required_worker_count: 2,
      linked_task_type: 'production_plan',
      linked_task_id: uuid('3'),
    }).kind).toBe('mixing');
  });

  it('links execution to a work order before mixing starts', () => {
    expect(linkExecutionWorkOrderSchema.safeParse({
      execution_type: 'production_batch', execution_id: uuid('1'), revision: 1, work_order_id: uuid('2'),
    }).success).toBe(true);
    expect(productionBatchMixingStartSchema.safeParse({
      production_batch_id: uuid('1'),
      revision: 1,
      mixer_equipment_id: uuid('3'),
      tank_equipment_id: uuid('4'),
    }).success).toBe(true);
    expect(productionBatchMixingStartSchema.safeParse({
      production_batch_id: uuid('1'),
      revision: 1,
      mixer_equipment_id: uuid('3'),
    }).success).toBe(false);
  });
});
