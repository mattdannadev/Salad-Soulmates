import { describe, expect, it } from 'vitest';
import plannerWindow from '../src/components/scheduling/planner-window';

describe('planner window', () => {
  it('includes last week and the day three months ahead', () => {
    expect(plannerWindow('2026-10-04')).toEqual({
      start: '2026-09-21', endExclusive: '2027-01-05',
    });
  });
  it('clamps month-end dates before including the last day', () => {
    expect(plannerWindow('2026-11-30')).toEqual({
      start: '2026-11-23', endExclusive: '2027-03-01',
    });
    expect(plannerWindow('2027-11-30')).toEqual({
      start: '2027-11-22', endExclusive: '2028-03-01',
    });
  });
});
