export type AircraftStatus =
  | 'OPERATIONAL'
  | 'AOG'
  | 'IN_MAINTENANCE'
  | 'GROUNDED'
  | 'DECOMMISSIONED';

export interface Aircraft {
  id: string;
  organizationId: string;
  /** Registration mark (MAT) */
  registration: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  engineCount: number;
  engineModel: string | null;
  /** Airframe Total Time in hours */
  totalFlightHours: number;
  /** Total landing / pressurisation cycles */
  totalCycles: number;
  status: AircraftStatus;
  manufactureDate: Date | null;
  registrationDate: Date | null;
  coaExpiryDate: Date | null;
  insuranceExpiryDate: Date | null;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export type CreateAircraftInput = Pick<
  Aircraft,
  | 'organizationId'
  | 'registration'
  | 'model'
  | 'manufacturer'
  | 'serialNumber'
  | 'engineCount'
  | 'engineModel'
  | 'manufactureDate'
  | 'registrationDate'
  | 'coaExpiryDate'
  | 'insuranceExpiryDate'
>;

export type UpdateAircraftInput = Partial<
  Pick<
    Aircraft,
    | 'model'
    | 'manufacturer'
    | 'serialNumber'
    | 'engineModel'
    | 'totalFlightHours'
    | 'totalCycles'
    | 'status'
    | 'coaExpiryDate'
    | 'insuranceExpiryDate'
  >
>;
