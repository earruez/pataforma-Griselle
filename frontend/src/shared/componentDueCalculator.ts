import type { ComponentIntervalType } from './componentTrackingTypes';

export interface DueCalculationInput {
  intervalType: ComponentIntervalType;
  intervalHours?: number | null;
  intervalCycles?: number | null;
  intervalDays?: number | null;
  appliedAt: string;
  aircraftHoursAtApplication: number;
  aircraftCyclesAtApplication: number;
  currentAircraftHours: number;
  currentAircraftCycles: number;
}

export interface DueCalculationResult {
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: string | null;
  remainingHours: number | null;
  remainingCycles: number | null;
  remainingDays: number | null;
  criticalDriver: 'hours' | 'cycles' | 'date' | 'none';
}

function daysBetween(dateIso: string, now = new Date()): number | null {
  const a = new Date(dateIso);
  if (Number.isNaN(a.getTime())) return null;
  const d1 = new Date(a);
  d1.setHours(0, 0, 0, 0);
  const d2 = new Date(now);
  d2.setHours(0, 0, 0, 0);
  return Math.round((d1.getTime() - d2.getTime()) / 86400000);
}

export function calculateNextDue(input: DueCalculationInput): DueCalculationResult {
  const nextDueHours =
    (input.intervalType === 'hours' || input.intervalType === 'mixed') && input.intervalHours
      ? input.aircraftHoursAtApplication + input.intervalHours
      : null;

  const nextDueCycles =
    (input.intervalType === 'cycles' || input.intervalType === 'mixed') && input.intervalCycles
      ? input.aircraftCyclesAtApplication + input.intervalCycles
      : null;

  const nextDueDate =
    (input.intervalType === 'calendar' || input.intervalType === 'mixed') && input.intervalDays
      ? new Date(new Date(input.appliedAt).getTime() + input.intervalDays * 86400000).toISOString()
      : null;

  const remainingHours = nextDueHours != null ? nextDueHours - input.currentAircraftHours : null;
  const remainingCycles = nextDueCycles != null ? nextDueCycles - input.currentAircraftCycles : null;
  const remainingDays = nextDueDate ? daysBetween(nextDueDate) : null;

  const candidates: Array<{ driver: 'hours' | 'cycles' | 'date'; ratio: number }> = [];
  if (remainingHours != null && input.intervalHours && input.intervalHours > 0) {
    candidates.push({ driver: 'hours', ratio: remainingHours / input.intervalHours });
  }
  if (remainingCycles != null && input.intervalCycles && input.intervalCycles > 0) {
    candidates.push({ driver: 'cycles', ratio: remainingCycles / input.intervalCycles });
  }
  if (remainingDays != null && input.intervalDays && input.intervalDays > 0) {
    candidates.push({ driver: 'date', ratio: remainingDays / input.intervalDays });
  }

  const criticalDriver = candidates.length
    ? candidates.reduce((prev, cur) => (cur.ratio < prev.ratio ? cur : prev)).driver
    : 'none';

  return {
    nextDueHours,
    nextDueCycles,
    nextDueDate,
    remainingHours,
    remainingCycles,
    remainingDays,
    criticalDriver,
  };
}
