import { describe, expect, it } from 'vitest';
import { employeeHasConflictingAssignment } from '@/components/scheduling/schedule-availability';

const candidate = {
  allDay: true,
  startDate: '2026-10-20',
  endDate: '2026-10-20',
  startAt: '2026-10-20T05:00:00.000Z',
  endAt: '2026-10-21T05:00:00.000Z',
};

const assignment = {
  id: 'work-1',
  type: 'mixing',
  employeeIds: ['employee-1'],
  allDay: false,
  startDate: '2026-10-20',
  endDate: '2026-10-20',
  startAt: '2026-10-20T15:00:00.000Z',
  endAt: '2026-10-20T16:00:00.000Z',
};

describe('daily employee availability', () => {
  it('blocks an employee with any assignment on the selected all-day work date', () => {
    expect(employeeHasConflictingAssignment('employee-1', candidate, [assignment])).toBe(true);
  });

  it('keeps the edited record current assignee selectable', () => {
    expect(employeeHasConflictingAssignment('employee-1', candidate, [assignment], assignment.id)).toBe(false);
  });

  it('does not block another employee or an off record', () => {
    expect(employeeHasConflictingAssignment('employee-2', candidate, [assignment])).toBe(false);
    expect(employeeHasConflictingAssignment('employee-1', candidate, [
      { ...assignment, type: 'off' },
    ])).toBe(false);
  });
});
