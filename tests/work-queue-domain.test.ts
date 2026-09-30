import { expect, it } from 'vitest';
import { createWorkQueueItemSchema } from '@/domain/work-queue';

const id = '00000000-0000-4000-8000-000000000001';
const base = {
  id,
  facility_id: id,
  work_on: '2026-10-12',
  title: 'Leo’s Italian mixing',
  instructions: '',
  required_worker_count: 2,
};

it('requires batch quota, estimate, and production context for mixing work', () => {
  expect(createWorkQueueItemSchema.safeParse({
    ...base,
    kind: 'mixing',
    batch_quota: 12,
    estimated_minutes: 180,
    linked_task_type: 'production_plan',
    linked_task_id: id,
  }).success).toBe(true);
  expect(createWorkQueueItemSchema.safeParse({
    ...base,
    kind: 'mixing',
    batch_quota: 12,
    estimated_minutes: 180,
    linked_task_type: null,
    linked_task_id: null,
  }).success).toBe(false);
  expect(createWorkQueueItemSchema.safeParse({
    ...base,
    kind: 'mixing',
    batch_quota: null,
    estimated_minutes: null,
    linked_task_type: 'production_plan',
    linked_task_id: id,
  }).success).toBe(false);
});

it('requires a purchase draft when scheduling inventory receiving', () => {
  expect(createWorkQueueItemSchema.safeParse({
    ...base,
    kind: 'receiving',
    batch_quota: null,
    estimated_minutes: null,
    linked_task_type: 'purchase_draft',
    linked_task_id: id,
  }).success).toBe(true);
  expect(createWorkQueueItemSchema.safeParse({
    ...base,
    kind: 'receiving',
    batch_quota: null,
    estimated_minutes: null,
    linked_task_type: null,
    linked_task_id: null,
  }).success).toBe(false);
});

it('allows standalone cleaning without creating an unnecessary workflow record', () => {
  expect(createWorkQueueItemSchema.safeParse({
    ...base,
    kind: 'cleaning',
    batch_quota: null,
    estimated_minutes: null,
    linked_task_type: null,
    linked_task_id: null,
  }).success).toBe(true);
});
