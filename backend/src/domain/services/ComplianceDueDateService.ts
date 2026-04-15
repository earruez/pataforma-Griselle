import { MaintenanceTask } from '../entities/MaintenanceTask';

const AVG_FLIGHT_HOURS_PER_DAY = 2;
const MS_PER_DAY = 24 * 60 * 60 * 1000;

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
  private addMonths(base: Date, months: number): Date {
    const result = new Date(base);
    const baseDay = result.getDate();
    result.setDate(1);
    result.setMonth(result.getMonth() + months);
    const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
    result.setDate(Math.min(baseDay, lastDay));
    return result;
  }

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

    let calendarDueDate: Date | null = null;
    if (task.intervalCalendarMonths != null) {
      calendarDueDate = this.addMonths(performedAt, task.intervalCalendarMonths);
    } else if (task.intervalCalendarDays != null) {
      calendarDueDate = new Date(performedAt);
      calendarDueDate.setDate(calendarDueDate.getDate() + task.intervalCalendarDays);
    }

    const hoursDueDate =
      task.intervalHours != null
        ? new Date(performedAt.getTime() + (task.intervalHours / AVG_FLIGHT_HOURS_PER_DAY) * MS_PER_DAY)
        : null;

    // Dual-limit tasks expire at the earliest criterion.
    let nextDueDate: Date | null = null;
    if (hoursDueDate && calendarDueDate) {
      nextDueDate = hoursDueDate <= calendarDueDate ? hoursDueDate : calendarDueDate;
    } else {
      nextDueDate = calendarDueDate ?? hoursDueDate;
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
    nextDueDate: Date | null = null,
    today: Date = new Date(),
  ): number | null {
    const byHours = nextDueHours != null ? nextDueHours - currentHours : null;
    const byCalendar =
      nextDueDate != null
        ? ((nextDueDate.getTime() - today.getTime()) / MS_PER_DAY) * AVG_FLIGHT_HOURS_PER_DAY
        : null;

    if (byHours != null && byCalendar != null) return Math.min(byHours, byCalendar);
    return byHours ?? byCalendar;
  }
}
