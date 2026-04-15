export type ComponentIntervalType = 'hours' | 'cycles' | 'calendar' | 'mixed';

export interface ComponentDefinition {
  id: string;
  ataChapter: string;
  ataCode: string;
  name: string;
  description: string;
  intervalType: ComponentIntervalType;
  intervalHours: number | null;
  intervalCycles: number | null;
  intervalDays: number | null;
  requiresComponentTracking: boolean;
  sourceGroup: string;
  reference: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ComponentInstanceStatus = 'installed' | 'removed' | 'spare' | 'scrapped';

export interface ComponentInstance {
  id: string;
  definitionId: string;
  aircraftId: string;
  partNumber: string;
  serialNumber: string;
  position: string;
  status: ComponentInstanceStatus;
  installedAt: string | null;
  removedAt: string | null;
  installedAtHours: number | null;
  removedAtHours: number | null;
  installedAtCycles: number | null;
  removedAtCycles: number | null;
  installWorkOrderNumber: string | null;
  removalWorkOrderNumber: string | null;
  createdAt: string;
  updatedAt: string;
}

export type ComponentMovementType = 'install' | 'remove' | 'replacement';

export interface ComponentMovement {
  id: string;
  aircraftId: string;
  position: string;
  movementType: ComponentMovementType;
  removedComponentInstanceId: string | null;
  installedComponentInstanceId: string | null;
  removedPartNumber?: string | null;
  removedSerialNumber?: string | null;
  installedPartNumber?: string | null;
  installedSerialNumber?: string | null;
  workRequestId: string;
  officeOrderId: string;
  workOrderNumber: string;
  performedAt: string;
  aircraftHoursAtMovement: number;
  aircraftCyclesAtMovement: number;
  notes: string | null;
  createdAt: string;
  performedByUserName: string;
}

export interface ComponentApplication {
  id: string;
  componentInstanceId: string;
  taskId: string;
  aircraftId: string;
  workRequestId: string;
  officeOrderId: string;
  workOrderNumber: string;
  appliedAt: string;
  aircraftHoursAtApplication: number;
  aircraftCyclesAtApplication: number;
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: string | null;
  notes: string | null;
  createdAt: string;
}

export interface AircraftSnapshot {
  currentHours: number;
  currentCycles: number;
  currentDate: string;
}

export type WorkRequestExecutionType =
  | 'maintenance_application'
  | 'component_replacement'
  | 'discrepancy_action';
