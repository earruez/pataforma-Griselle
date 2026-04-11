import { apiClient } from './client';

export type AircraftStatus = 'OPERATIONAL' | 'AOG' | 'IN_MAINTENANCE' | 'GROUNDED' | 'DECOMMISSIONED';

export interface Aircraft {
  id: string;
  registration: string;
  model: string;
  manufacturer: string;
  serialNumber: string;
  engineCount: number;
  engineModel: string | null;
  totalFlightHours: number;
  totalCycles: number;
  status: AircraftStatus;
  coaExpiryDate: string | null;
  insuranceExpiryDate: string | null;
}

export interface CreateAircraftInput {
  registration: string;
  manufacturer: string;
  model: string;
  serialNumber: string;
  totalFlightHours?: number;
  totalCycles?: number;
  engineCount?: number;
  engineModel?: string | null;
}

export const aircraftApi = {
  findAll: async (): Promise<Aircraft[]> => {
    const { data } = await apiClient.get('/aircraft', { params: { page: 1, limit: 100 } });
    return (data.data ?? data) as Aircraft[];
  },
  findById: async (id: string): Promise<Aircraft> => {
    const { data } = await apiClient.get<{ status: string; data: Aircraft }>(`/aircraft/${id}`);
    return data.data;
  },
  create: async (input: CreateAircraftInput): Promise<Aircraft> => {
    const { data } = await apiClient.post<{ status: string; data: Aircraft }>('/aircraft', input);
    return data.data;
  },
};
