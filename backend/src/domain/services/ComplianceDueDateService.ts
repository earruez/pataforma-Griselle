import { MaintenanceTask } from '../entities/MaintenanceTask';

/**
 * Pure domain service: calculates the next-due values for a compliance record.
 * Contains NO I/O — fully unit-testable.
 *
 * Aeronautical integrity rule: when an interval type combines two dimensions
 * (e.g. FLIGHT_HOURS_OR_CALENDAR), the MORE RESTRICTIVE (earliest) limit wins.
 */
export interface NextDueValues {
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: Date | null;
}

export class ComplianceDueDateService {
  /**
   * @param task            The task definition
   * @param currentHours    Aircraft total hours at the time of compliance
   * @param currentCycles   Aircraft total cycles at the time of compliance
   * @param performedAt     Date/time the task was performed
   */
  calculate(
    task: MaintenanceTask,
    currentHours: number,
    currentCycles: number,
    performedAt: Date,
  ): NextDueValues {
    const nextDueHours =
      task.intervalHours != null ? currentHours + task.intervalHours : null;

    const nextDueCycles =
      task.intervalCycles != null ? currentCycles + task.intervalCycles : null;

    let nextDueDate: Date | null = null;
    if (task.intervalCalendarDays != null) {
      nextDueDate = new Date(performedAt);
      nextDueDate.setDate(nextDueDate.getDate() + task.intervalCalendarDays);
    }

    return { nextDueHours, nextDueCycles, nextDueDate };
  }

  /**
   * Determines if a task is currently overdue given the aircraft's current state.
   * Tolerances are applied before declaring overdue.
   */
  isOverdue(
    task: MaintenanceTask,
    nextDue: NextDueValues,
    currentHours: number,
    currentCycles: number,
    today: Date = new Date(),
  ): boolean {
    if (
      nextDue.nextDueHours != null &&
      currentHours > nextDue.nextDueHours + (task.toleranceHours ?? 0)
    ) {
      return true;
    }

    if (
      nextDue.nextDueCycles != null &&
      currentCycles > nextDue.nextDueCycles + (task.toleranceCycles ?? 0)
    ) {
      return true;
    }

    if (nextDue.nextDueDate != null) {
      const toleranceDays = task.toleranceCalendarDays ?? 0;
      const effectiveDueDate = new Date(nextDue.nextDueDate);
      effectiveDueDate.setDate(effectiveDueDate.getDate() + toleranceDays);
      if (today > effectiveDueDate) return true;
    }

    return false;
  }

  /**
   * Returns remaining hours before the next due point (negative = already overdue).
   */
  hoursRemaining(
    nextDueHours: number | null,
    currentHours: number,
  ): number | null {
    if (nextDueHours == null) return null;
    return nextDueHours - currentHours;
  }
}
