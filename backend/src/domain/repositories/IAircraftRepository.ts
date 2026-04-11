import { Aircraft, AircraftStatus, CreateAircraftInput, UpdateAircraftInput } from '../entities/Aircraft';
import { PaginatedResult, PaginationOptions } from './shared';

export type PlanItemStatus = 'OVERDUE' | 'DUE_SOON' | 'OK' | 'NEVER_PERFORMED';

export interface MaintenancePlanItem {
  taskId: string;
  taskCode: string;
  taskTitle: string;
  intervalType: string;
  intervalHours: number | null;
  intervalCycles: number | null;
  intervalCalendarDays: number | null;
  referenceType: string;
  referenceNumber: string | null;
  isMandatory: boolean;
  estimatedManHours: number | null;
  lastPerformedAt: Date | null;
  lastWorkOrder: string | null;
  lastHoursAtCompliance: number | null;
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: Date | null;
  hoursRemaining: number | null;
  cyclesRemaining: number | null;
  daysRemaining: number | null;
  status: PlanItemStatus;
}

export interface IAircraftRepository {
  findById(id: string, organizationId: string): Promise<Aircraft | null>;
  findByRegistration(registration: string, organizationId: string): Promise<Aircraft | null>;
  findAll(
    organizationId: string,
    options?: PaginationOptions,
    statusFilter?: AircraftStatus,
  ): Promise<PaginatedResult<Aircraft>>;
  create(input: CreateAircraftInput): Promise<Aircraft>;
  update(id: string, organizationId: string, input: UpdateAircraftInput): Promise<Aircraft>;
  delete(id: string, organizationId: string): Promise<void>;
  getMaintenancePlan(aircraftId: string, organizationId: string): Promise<MaintenancePlanItem[]>;
}
