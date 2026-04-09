export type ComponentStatus =
  | 'INSTALLED'
  | 'SERVICEABLE'
  | 'UNSERVICEABLE'
  | 'IN_SHOP'
  | 'SCRAPPED';

export interface Component {
  id: string;
  organizationId: string;
  aircraftId: string | null;
  /** Part Number (P/N) */
  partNumber: string;
  /** Serial Number (S/N) */
  serialNumber: string;
  description: string;
  manufacturer: string;
  position: string | null;
  // Life tracking
  totalHoursSinceNew: number;
  totalCyclesSinceNew: number;
  hoursSinceOverhaul: number;
  cyclesSinceOverhaul: number;
  // TBO limits
  tboHours: number | null;
  tboCycles: number | null;
  tboCalendarDays: number | null;
  // Hard life limits
  lifeLimitHours: number | null;
  lifeLimitCycles: number | null;
  // Installation data
  installationDate: Date | null;
  installationAircraftHours: number | null;
  installationAircraftCycles: number | null;
  status: ComponentStatus;
  isActive: boolean;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateComponentInput = Pick<
  Component,
  | 'organizationId'
  | 'aircraftId'
  | 'partNumber'
  | 'serialNumber'
  | 'description'
  | 'manufacturer'
  | 'position'
  | 'tboHours'
  | 'tboCycles'
  | 'tboCalendarDays'
  | 'lifeLimitHours'
  | 'lifeLimitCycles'
>;
