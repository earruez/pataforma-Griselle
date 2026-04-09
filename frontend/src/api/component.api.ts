import apiClient from './client';

export interface Component {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  position: string | null;
  manufacturer: string | null;
  totalHoursSinceNew: number | null;
  totalCyclesSinceNew: number | null;
  hoursSinceOverhaul: number | null;
  cyclesSinceOverhaul: number | null;
  tboHours: number | null;
  tboCycles: number | null;
  tboCalendarDays: number | null;
  lifeLimitHours: number | null;
  lifeLimitCycles: number | null;
  installationDate: string | null;
  aircraftId: string | null;
}

export const componentApi = {
  findByAircraft: (aircraftId: string) =>
    apiClient.get<Component[]>(`/components/aircraft/${aircraftId}`).then((r) => r.data),

  findAll: () => apiClient.get<Component[]>('/components').then((r) => r.data),
};
