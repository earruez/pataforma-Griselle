export type ComplianceStatus = 'COMPLETED' | 'DEFERRED' | 'OVERDUE' | 'CANCELLED';

export interface Compliance {
  id: string;
  organizationId: string;
  aircraftId: string;
  taskId: string;
  componentId: string | null;
  performedById: string;
  inspectedById: string | null;
  performedAt: Date;
  aircraftHoursAtCompliance: number;
  aircraftCyclesAtCompliance: number;
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: Date | null;
  workOrderNumber: string | null;
  status: ComplianceStatus;
  deferralReference: string | null;
  deferralExpiresAt: Date | null;
  notes: string | null;
  createdAt: Date;
}

export type CreateComplianceInput = Pick<
  Compliance,
  | 'organizationId'
  | 'aircraftId'
  | 'taskId'
  | 'componentId'
  | 'performedById'
  | 'inspectedById'
  | 'performedAt'
  | 'aircraftHoursAtCompliance'
  | 'aircraftCyclesAtCompliance'
  | 'nextDueHours'
  | 'nextDueCycles'
  | 'nextDueDate'
  | 'workOrderNumber'
  | 'notes'
  | 'deferralReference'
  | 'deferralExpiresAt'
>;
