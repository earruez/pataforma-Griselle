import type { ComponentIntervalType } from './componentTrackingTypes';
import type { AircraftSnapshot, ComponentApplication, ComponentDefinition } from './componentTrackingTypes';

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

type VisualState = 'critical' | 'warning' | 'ok';
type CriticalBy = 'hours' | 'cycles' | 'calendar' | 'none';

interface MetricLabel {
  key: Exclude<CriticalBy, 'none'>;
  label: string;
}

interface ComponentDueLabels {
  ata: string;
  limit: MetricLabel[];
  actual: MetricLabel[];
  remaining: MetricLabel[];
  nextDue: MetricLabel[];
  dueOn: string;
  status: 'Crítico' | 'Atención' | 'OK';
}

export interface ComponentDueResult {
  intervalType: ComponentIntervalType;
  ataCode: string;
  ataChapter: string;
  limitHours: number | null;
  limitCycles: number | null;
  limitDays: number | null;
  actualHours: number | null;
  actualCycles: number | null;
  actualDays: number | null;
  remainingHours: number | null;
  remainingCycles: number | null;
  remainingDays: number | null;
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: string | null;
  criticalBy: CriticalBy;
  status: VisualState;
  labels: ComponentDueLabels;
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

function ratioToState(ratio: number | null, isExpired: boolean): VisualState {
  if (isExpired || (ratio != null && ratio < 0.1)) return 'critical';
  if (ratio != null && ratio <= 0.25) return 'warning';
  return 'ok';
}

function safeDaysDiff(from: string, to: string): number | null {
  const a = new Date(from);
  const b = new Date(to);
  if (Number.isNaN(a.getTime()) || Number.isNaN(b.getTime())) return null;
  const d1 = new Date(a);
  const d2 = new Date(b);
  d1.setHours(0, 0, 0, 0);
  d2.setHours(0, 0, 0, 0);
  return Math.round((d2.getTime() - d1.getTime()) / 86400000);
}

function formatDate(value: string | null): string {
  if (!value) return '—';
  const d = new Date(value);
  if (Number.isNaN(d.getTime())) return '—';
  return d.toLocaleDateString('es-MX');
}

function formatMetric(value: number | null, unit: 'FH' | 'CYC' | 'D'): string {
  if (value == null) return '—';
  if (unit === 'FH') return `${value.toFixed(0)} FH`;
  if (unit === 'CYC') return `${Math.round(value)} CYC`;
  return `${Math.round(value)} D`;
}

function statusLabel(status: VisualState): 'Crítico' | 'Atención' | 'OK' {
  if (status === 'critical') return 'Crítico';
  if (status === 'warning') return 'Atención';
  return 'OK';
}

export function calculateComponentDue(
  definition: ComponentDefinition,
  application: ComponentApplication,
  snapshot: AircraftSnapshot,
): ComponentDueResult {
  const usesHours = definition.intervalType === 'hours' || definition.intervalType === 'mixed';
  const usesCycles = definition.intervalType === 'cycles' || definition.intervalType === 'mixed';
  const usesCalendar = definition.intervalType === 'calendar' || definition.intervalType === 'mixed';

  // Render-time helper: consume persisted next due values from the application record.
  const nextDueHours = usesHours
    ? application.nextDueHours
    : null;
  const nextDueCycles = usesCycles
    ? application.nextDueCycles
    : null;
  const nextDueDate = usesCalendar
    ? application.nextDueDate
    : null;

  const actualHours = usesHours ? snapshot.currentHours - application.aircraftHoursAtApplication : null;
  const actualCycles = usesCycles ? snapshot.currentCycles - application.aircraftCyclesAtApplication : null;
  const actualDays = usesCalendar ? safeDaysDiff(application.appliedAt, snapshot.currentDate) : null;

  const remainingHours = nextDueHours != null ? nextDueHours - snapshot.currentHours : null;
  const remainingCycles = nextDueCycles != null ? nextDueCycles - snapshot.currentCycles : null;
  const remainingDays = nextDueDate != null ? safeDaysDiff(snapshot.currentDate, nextDueDate) : null;

  const candidates: Array<{ by: 'hours' | 'cycles' | 'calendar'; ratio: number }> = [];
  if (remainingHours != null && definition.intervalHours != null && definition.intervalHours > 0) {
    candidates.push({ by: 'hours', ratio: remainingHours / definition.intervalHours });
  }
  if (remainingCycles != null && definition.intervalCycles != null && definition.intervalCycles > 0) {
    candidates.push({ by: 'cycles', ratio: remainingCycles / definition.intervalCycles });
  }
  if (remainingDays != null && definition.intervalDays != null && definition.intervalDays > 0) {
    candidates.push({ by: 'calendar', ratio: remainingDays / definition.intervalDays });
  }

  const critical = candidates.length
    ? candidates.reduce((prev, cur) => (cur.ratio < prev.ratio ? cur : prev))
    : null;

  const expired = (remainingHours != null && remainingHours < 0)
    || (remainingCycles != null && remainingCycles < 0)
    || (remainingDays != null && remainingDays < 0);

  const criticalBy: CriticalBy = critical?.by ?? 'none';
  const status = ratioToState(critical?.ratio ?? null, expired);

  const limit: MetricLabel[] = [];
  const actual: MetricLabel[] = [];
  const remaining: MetricLabel[] = [];
  const nextDue: MetricLabel[] = [];

  if (definition.intervalHours != null) limit.push({ key: 'hours', label: formatMetric(definition.intervalHours, 'FH') });
  if (definition.intervalCycles != null) limit.push({ key: 'cycles', label: formatMetric(definition.intervalCycles, 'CYC') });
  if (definition.intervalDays != null) limit.push({ key: 'calendar', label: formatMetric(definition.intervalDays, 'D') });

  if (actualHours != null) actual.push({ key: 'hours', label: formatMetric(actualHours, 'FH') });
  if (actualCycles != null) actual.push({ key: 'cycles', label: formatMetric(actualCycles, 'CYC') });
  if (actualDays != null) actual.push({ key: 'calendar', label: formatMetric(actualDays, 'D') });

  if (remainingHours != null) remaining.push({ key: 'hours', label: formatMetric(remainingHours, 'FH') });
  if (remainingCycles != null) remaining.push({ key: 'cycles', label: formatMetric(remainingCycles, 'CYC') });
  if (remainingDays != null) remaining.push({ key: 'calendar', label: formatMetric(remainingDays, 'D') });

  if (nextDueHours != null) nextDue.push({ key: 'hours', label: formatMetric(nextDueHours, 'FH') });
  if (nextDueCycles != null) nextDue.push({ key: 'cycles', label: formatMetric(nextDueCycles, 'CYC') });
  if (nextDueDate != null) nextDue.push({ key: 'calendar', label: formatDate(nextDueDate) });

  return {
    intervalType: definition.intervalType,
    ataCode: definition.ataCode,
    ataChapter: definition.ataChapter,
    limitHours: definition.intervalHours,
    limitCycles: definition.intervalCycles,
    limitDays: definition.intervalDays,
    actualHours,
    actualCycles,
    actualDays,
    remainingHours,
    remainingCycles,
    remainingDays,
    nextDueHours,
    nextDueCycles,
    nextDueDate,
    criticalBy,
    status,
    labels: {
      ata: definition.ataCode || definition.ataChapter || 'N/A',
      limit,
      actual,
      remaining,
      nextDue,
      dueOn: formatDate(nextDueDate),
      status: statusLabel(status),
    },
  };
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
