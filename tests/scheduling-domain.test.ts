import { expect, it } from 'vitest';
import {
  facilityCalendarDateAt, groupWorkDays, inclusiveScheduleEnd, scheduleEventInputSchema,
  matchesPublishedWork, scheduleKindLabel, scheduleRangeSchema,
  selectLinkedPreparation,
} from '@/domain/scheduling';

const id = '00000000-0000-4000-8000-000000000001';
const event = {
  id,
  facility_id: id,
  revision: 0,
  start_on: '2026-09-28',
  end_on: '2026-09-29',
  kind: 'mixing',
  title: '',
  production_plan_id: null,
  employee_ids: [id],
};

it('accepts one or more employees and exclusive all-day dates', () => {
  expect(scheduleEventInputSchema.safeParse(event).success).toBe(true);
  expect(scheduleEventInputSchema.safeParse({
    ...event, end_on: event.start_on,
  }).success).toBe(false);
  expect(scheduleEventInputSchema.safeParse({ ...event, employee_ids: [] }).success).toBe(true);
  expect(scheduleEventInputSchema.safeParse({
    ...event, employee_ids: [id, id],
  }).success).toBe(false);
  expect(scheduleEventInputSchema.safeParse({
    ...event, start_on: '2026-02-30',
  }).success).toBe(false);
});

it('keeps the requested report window exclusive at the end', () => {
  expect(scheduleRangeSchema.safeParse({ facility_id: id, start_on: '2026-09-28', end_on: '2026-10-05' }).success).toBe(true);
  expect(scheduleRangeSchema.safeParse({ facility_id: id, start_on: '2026-10-05', end_on: '2026-09-28' }).success).toBe(false);
});

it('lists a multi-day assignment on every covered day and includes work already in progress', () => {
  const ongoing = { id: 'ongoing', start_on: '2026-09-27', end_on: '2026-09-30' };
  const oneDay = { id: 'single', start_on: '2026-09-29', end_on: '2026-09-30' };
  expect(groupWorkDays([ongoing, oneDay], '2026-09-28', '2026-10-01'))
    .toEqual([
      { day: '2026-09-28', events: [ongoing] },
      { day: '2026-09-29', events: [ongoing, oneDay] },
    ]);
});

it('uses the facility calendar date near a UTC day boundary', () => {
  expect(facilityCalendarDateAt(new Date('2026-09-28T02:00:00Z'), 'America/Chicago'))
    .toBe('2026-09-27');
});

it('renders the inclusive business end date for one or multiple days', () => {
  expect(inclusiveScheduleEnd('2026-09-29')).toBe('2026-09-28');
  expect(inclusiveScheduleEnd('2026-10-01')).toBe('2026-09-30');
});

it('uses a Spanish task label when an assignment title is blank', () => {
  expect(scheduleKindLabel('ingredient_prep', 'es')).toBe('Preparación de ingredientes');
  expect(scheduleKindLabel('mixing', 'es')).toBe('Mezcla');
});

it('marks work published only when all worker-visible fields still match', () => {
  const published = {
    id,
    startDate: '2026-09-28',
    endDate: '2026-09-28',
    type: 'mixing' as const,
    note: 'Batch',
    employeeIds: [id],
    productionPlanId: id,
    linkedTaskType: 'planned_mixer_batch',
    linkedTaskId: id,
    productId: null,
    customerId: null,
    locationLabel: null,
  };
  expect(matchesPublishedWork(published, published)).toBe(true);
  expect(matchesPublishedWork({ ...published, note: 'Changed' }, published)).toBe(false);
  expect(matchesPublishedWork({ ...published, type: 'ingredient_prep' }, published)).toBe(false);
  expect(matchesPublishedWork(
    { ...published, linkedTaskType: 'planned_spice_preparation' },
    published,
  )).toBe(false);
  expect(matchesPublishedWork({ ...published, productionPlanId: null }, published)).toBe(false);
});

it('selects only the exact mixer or spice preparation linked to Start', () => {
  const first = {
    planned_mixer_batch_id: 'mixer-a', planned_spice_preparation_id: 'spice-a',
  };
  const second = {
    planned_mixer_batch_id: 'mixer-b', planned_spice_preparation_id: 'spice-b',
  };
  const preparations = [first, second];
  expect(selectLinkedPreparation('planned_spice_preparation', 'spice-b', preparations))
    .toBe(second);
  expect(selectLinkedPreparation('planned_mixer_batch', 'mixer-a', preparations))
    .toBe(first);
  expect(selectLinkedPreparation('planned_mixer_batch', 'spice-b', preparations))
    .toBeUndefined();
});
