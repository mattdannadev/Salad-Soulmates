import { describe, expect, it } from 'vitest';
import { movableConnectedScheduleIds } from '@/components/scheduling/schedule-move';

const items = [
  { id: 'prep', startAt: '2026-10-05T00:00:00.000Z', completed: false },
  { id: 'mix', startAt: '2026-10-06T00:00:00.000Z', completed: false },
  { id: 'pack', startAt: '2026-10-07T00:00:00.000Z', completed: false },
  { id: 'completed', startAt: '2026-10-08T00:00:00.000Z', completed: true },
  { id: 'after-completed', startAt: '2026-10-09T00:00:00.000Z', completed: false },
];

describe('movableConnectedScheduleIds', () => {
  it('moves only unfinished downstream work in date order', () => {
    expect(movableConnectedScheduleIds('mix', items, [
      { from: 'prep', to: 'mix' }, { from: 'mix', to: 'pack' },
    ])).toEqual(['mix', 'pack']);
  });

  it('uses completed work as an immovable branch boundary', () => {
    expect(movableConnectedScheduleIds('prep', items, [
      { from: 'prep', to: 'mix' }, { from: 'mix', to: 'completed' },
      { from: 'completed', to: 'after-completed' },
    ])).toEqual(['prep', 'mix']);
    expect(movableConnectedScheduleIds('completed', items, [])).toEqual([]);
  });

  it('does not move predecessors when a middle work order moves', () => {
    expect(movableConnectedScheduleIds('mix', items, [
      { from: 'prep', to: 'mix' }, { from: 'mix', to: 'pack' },
    ])).not.toContain('prep');
  });
});
