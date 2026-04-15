export interface CurrentStatus {
  totalHours: number;
  totalDays: number;
  n1: number;
  n2: number;
}

export type HealthBucket = 'danger' | 'warning' | 'healthy';

export type RemainingUnit = 'FH' | 'DAYS' | 'MONTHS' | 'CYCLES' | 'UNKNOWN';

export interface CsvMaintenanceTask {
  ATA?: string;
  ata?: string;
  Description?: string;
  description?: string;
  [key: string]: unknown;
}

interface ParsedLimit {
  unitRaw: string;
  unit: RemainingUnit;
  limit: number;
  current: number;
  remaining: number;
}

export interface ClassifiedTask {
  ata: string;
  description: string;
  selectedRemaining: number | null;
  selectedUnit: RemainingUnit;
  bucket: HealthBucket;
  limits: ParsedLimit[];
  raw: CsvMaintenanceTask;
}

export interface ClassifiedMaintenancePlan {
  danger: ClassifiedTask[];
  warning: ClassifiedTask[];
  healthy: ClassifiedTask[];
}

function normalizeUnit(unitRaw: string): RemainingUnit {
  const normalized = unitRaw.trim().toUpperCase();
  if (normalized === 'FH' || normalized === 'H' || normalized === 'HRS') return 'FH';
  if (normalized === 'D' || normalized === 'DAY' || normalized === 'DAYS') return 'DAYS';
  if (normalized === 'M' || normalized === 'MON' || normalized === 'MONTH' || normalized === 'MONTHS') return 'MONTHS';
  if (normalized === 'CYC' || normalized === 'CYCLE' || normalized === 'CYCLES' || normalized === 'CH') return 'CYCLES';
  return 'UNKNOWN';
}

function toNumber(value: unknown): number | null {
  if (value == null || value === '') return null;
  const parsed = Number(String(value).replace(',', '.').replace(/[^0-9.-]/g, ''));
  return Number.isFinite(parsed) ? parsed : null;
}

function currentByUnit(unit: RemainingUnit, status: CurrentStatus): number {
  if (unit === 'FH') return status.totalHours;
  if (unit === 'DAYS') return status.totalDays;
  if (unit === 'MONTHS') return status.totalDays / 30;
  if (unit === 'CYCLES') return Math.max(status.n1, status.n2);
  return 0;
}

function findValue(task: CsvMaintenanceTask, keys: string[]): unknown {
  for (const key of keys) {
    if (task[key] != null) return task[key];
  }
  return null;
}

function getAta(task: CsvMaintenanceTask): string {
  return String(findValue(task, ['ATA', 'ata', 'Ata', 'taskCode', 'TaskCode']) ?? '').trim();
}

function getDescription(task: CsvMaintenanceTask): string {
  return String(findValue(task, ['Description', 'description', 'Descripcion', 'taskTitle', 'TaskTitle']) ?? '').trim();
}

function extractLimits(task: CsvMaintenanceTask, status: CurrentStatus): ParsedLimit[] {
  const parsed: ParsedLimit[] = [];

  for (let i = 1; i <= 4; i += 1) {
    const unitRaw = findValue(task, [`Unit ${i}`, `Unit${i}`, `unit ${i}`, `unit${i}`]);
    const limitRaw = findValue(task, [`Limit ${i}`, `Limit${i}`, `limit ${i}`, `limit${i}`]);

    const unitText = unitRaw == null ? '' : String(unitRaw).trim();
    const limit = toNumber(limitRaw);
    if (!unitText || limit == null) continue;

    const unit = normalizeUnit(unitText);
    const current = currentByUnit(unit, status);
    parsed.push({
      unitRaw: unitText,
      unit,
      limit,
      current,
      remaining: limit - current,
    });
  }

  return parsed;
}

export function classifyRemaining(remaining: number | null, unit: RemainingUnit): HealthBucket {
  if (remaining == null) return 'healthy';
  if (remaining <= 0) return 'danger';

  if (unit === 'FH' && remaining <= 50) return 'warning';
  if (unit === 'DAYS' && remaining <= 30) return 'warning';
  if (unit === 'MONTHS' && remaining * 30 <= 30) return 'warning';

  return 'healthy';
}

export function classifyMaintenancePlan(
  currentStatus: CurrentStatus,
  maintenanceTasks: CsvMaintenanceTask[],
): ClassifiedMaintenancePlan {
  const out: ClassifiedMaintenancePlan = { danger: [], warning: [], healthy: [] };

  for (const task of maintenanceTasks) {
    const limits = extractLimits(task, currentStatus);
    const selected = limits.length
      ? limits.reduce((min, row) => (row.remaining < min.remaining ? row : min))
      : null;

    const selectedRemaining = selected?.remaining ?? null;
    const selectedUnit = selected?.unit ?? 'UNKNOWN';
    const bucket = classifyRemaining(selectedRemaining, selectedUnit);

    const row: ClassifiedTask = {
      ata: getAta(task),
      description: getDescription(task),
      selectedRemaining,
      selectedUnit,
      bucket,
      limits,
      raw: task,
    };

    out[bucket].push(row);
  }

  return out;
}
