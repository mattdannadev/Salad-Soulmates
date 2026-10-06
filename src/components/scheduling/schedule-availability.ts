export interface ScheduleInterval {
  allDay: boolean;
  startDate: string;
  endDate: string;
  startAt: string;
  endAt: string;
}

interface EmployeeAssignment extends ScheduleInterval {
  id: string;
  type: string;
  employeeIds: string[];
}

function overlaps(first: ScheduleInterval, second: ScheduleInterval) {
  if (first.allDay || second.allDay) {
    return first.startDate <= second.endDate && first.endDate >= second.startDate;
  }
  const firstStart = Date.parse(first.startAt);
  const firstEnd = Date.parse(first.endAt);
  const secondStart = Date.parse(second.startAt);
  const secondEnd = Date.parse(second.endAt);
  return Number.isFinite(firstStart)
    && Number.isFinite(firstEnd)
    && Number.isFinite(secondStart)
    && Number.isFinite(secondEnd)
    && firstStart < secondEnd
    && secondStart < firstEnd;
}

/** True when an employee is already committed during this scheduling interval. */
export function employeeHasConflictingAssignment(
  employeeId: string,
  candidate: ScheduleInterval,
  assignments: EmployeeAssignment[],
  excludedId?: string,
) {
  return assignments.some((assignment) => assignment.id !== excludedId
    && assignment.type !== 'off'
    && assignment.employeeIds.includes(employeeId)
    && overlaps(candidate, assignment));
}
