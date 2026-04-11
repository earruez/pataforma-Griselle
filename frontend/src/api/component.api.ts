import { apiClient } from './client';

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

export interface CreateComponentInput {
  partNumber: string;
  serialNumber: string;
  description: string;
  manufacturer: string;
  aircraftId?: string | null;
  position?: string | null;
  tboHours?: number | null;
  tboCycles?: number | null;
}

export const componentApi = {
  findByAircraft: (aircraftId: string) =>
    apiClient.get<{ status: string; data: Component[] }>(`/components/aircraft/${aircraftId}`).then((r) => r.data.data),

  findAll: () => apiClient.get<{ status: string; data: Component[] }>('/components').then((r) => r.data.data),

  create: async (input: CreateComponentInput): Promise<Component> => {
    const { data } = await apiClient.post<{ status: string; data: Component }>('/components', input);
    return data.data;
  },
};
