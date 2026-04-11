import { apiClient } from './client';

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
  lastPerformedAt: string | null;
  lastWorkOrder: string | null;
  lastHoursAtCompliance: number | null;
  nextDueHours: number | null;
  nextDueCycles: number | null;
  nextDueDate: string | null;
  hoursRemaining: number | null;
  cyclesRemaining: number | null;
  daysRemaining: number | null;
  status: PlanItemStatus;
}

export const maintenancePlanApi = {
  getForAircraft: async (aircraftId: string): Promise<MaintenancePlanItem[]> => {
    const { data } = await apiClient.get<{ status: string; data: MaintenancePlanItem[] }>(
      `/aircraft/${aircraftId}/maintenance-plan`,
    );
    return data.data;
  },
};
