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

export const aircraftApi = {
  findAll: async (page = 1, limit = 20) => {
    const { data } = await apiClient.get('/aircraft', { params: { page, limit } });
    return data as { data: Aircraft[]; total: number; page: number; totalPages: number };
  },
  findById: async (id: string): Promise<Aircraft> => {
    const { data } = await apiClient.get<{ status: string; data: Aircraft }>(`/aircraft/${id}`);
    return data.data;
  },
};
