export type TaskIntervalType =
  | 'FLIGHT_HOURS'
  | 'CYCLES'
  | 'CALENDAR_DAYS'
  | 'FLIGHT_HOURS_OR_CALENDAR'
  | 'CYCLES_OR_CALENDAR'
  | 'ON_CONDITION';

export type ReferenceType =
  | 'AMM'
  | 'AD'
  | 'SB'
  | 'CMR'
  | 'CDCCL'
  | 'MPD'
  | 'ETOPS'
  | 'INTERNAL';

export interface MaintenanceTask {
  id: string;
  organizationId: string;
  code: string;
  title: string;
  description: string;
  intervalType: TaskIntervalType;
  intervalHours: number | null;
  intervalCycles: number | null;
  intervalCalendarDays: number | null;
  intervalCalendarMonths: number | null;
  toleranceHours: number | null;
  toleranceCycles: number | null;
  toleranceCalendarDays: number | null;
  referenceNumber: string | null;
  referenceType: ReferenceType;
  isMandatory: boolean;
  estimatedManHours: number | null;
  requiresInspection: boolean;
  applicableModel: string | null;
  applicablePartNumber: string | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateMaintenanceTaskInput = Pick<
  MaintenanceTask,
  | 'organizationId'
  | 'code'
  | 'title'
  | 'description'
  | 'intervalType'
  | 'intervalHours'
  | 'intervalCycles'
  | 'intervalCalendarDays'
  | 'intervalCalendarMonths'
  | 'toleranceHours'
  | 'toleranceCycles'
  | 'toleranceCalendarDays'
  | 'referenceNumber'
  | 'referenceType'
  | 'isMandatory'
  | 'estimatedManHours'
  | 'requiresInspection'
  | 'applicableModel'
  | 'applicablePartNumber'
>;
