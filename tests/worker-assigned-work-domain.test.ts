import { describe, expect, it } from 'vitest';
import { assignedWorkerWorkSchema } from '@/domain/work-queue';

const uuid = (suffix: string) => `00000000-0000-4000-8000-${suffix.padStart(12, '0')}`;

describe('assigned worker work contract', () => {
  it('accepts calendar context without planner-wide staffing data', () => {
    const result = assignedWorkerWorkSchema.parse({
      facility: { id: uuid('1'), name: 'Main plant', timezone: 'America/Chicago' },
      start_on: '2026-10-01',
      end_on: '2026-11-01',
      items: [{
        id: uuid('2'),
        work_on: '2026-10-05',
        kind: 'mixing',
        title: 'Ranch mixing',
        instructions: '',
        status: 'claimed',
        revision: 1,
        start_at: '2026-10-05T13:00:00Z',
        end_at: '2026-10-05T15:00:00Z',
        all_day: false,
        timezone: 'America/Chicago',
        location_label: 'Mixer room',
        required_worker_count: 2,
        batch_quota: 1,
        estimated_minutes: 120,
        linked_task_type: 'production_plan',
        linked_task_id: uuid('3'),
        assignment: {
          source: 'supervisor_assigned', assigned_at: '2026-10-01T12:00:00Z',
        },
        customer: { id: uuid('4'), name: 'Sample customer' },
        order: { id: uuid('3'), reference: 'SO-42', needed_on: '2026-10-06' },
        product: { id: uuid('5'), name: 'Ranch' },
        batch_context: [{
          type: 'production_batch', id: uuid('6'), code: 'RANCH-01', state: 'not_started',
        }],
        coworkers: ['Jordan Rivera'],
      }],
    });

    expect(result.items[0]).toMatchObject({
      kind: 'mixing',
      coworkers: ['Jordan Rivera'],
      order: { reference: 'SO-42' },
    });
  });
});
