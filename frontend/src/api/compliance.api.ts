import { apiClient } from './client';

export interface Compliance {
  id: string;
  aircraftId: string;
  taskId: string;
  componentId: string | null;
  performedAt: string;
  aircraftHoursAtCompliance: number;
  aircraftCyclesAtCompliance: number;
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: string | null;
  status: 'COMPLETED' | 'DEFERRED' | 'OVERDUE' | 'CANCELLED';
  workOrderNumber: string | null;
  deferralReference: string | null;
  deferralExpiresAt: string | null;
  task?: {
    code: string;
    referenceType: string | null;
    referenceNumber: string | null;
  } | null;
  aircraft?: {
    totalFlightHours: number;
    totalCycles: number;
  } | null;
  inspectedBy?: {
    name: string;
  } | null;
}

export const complianceApi = {
  latestForAircraft: async (aircraftId: string): Promise<Compliance[]> => {
    const { data } = await apiClient.get<{ status: string; data: Compliance[] }>(
      `/compliances/aircraft/${aircraftId}/latest`,
    );
    return data.data;
  },
};
