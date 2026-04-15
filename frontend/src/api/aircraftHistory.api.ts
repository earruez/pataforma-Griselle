import { apiClient } from './client';

export interface AircraftAlterationHistoryItem {
  id: string;
  movementType: 'INSTALLED' | 'REMOVED';
  movedAt: string;
  notes: string | null;
  position: string | null;
  component: {
    id: string;
    partNumber: string;
    serialNumber: string;
    description: string;
  };
  performedBy: {
    id: string;
    name: string;
    role: string;
  };
  workOrder: {
    id: string;
    number: string;
  } | null;
}

export const aircraftHistoryApi = {
  async getAlterationsByAircraft(aircraftId: string): Promise<AircraftAlterationHistoryItem[]> {
    const { data } = await apiClient.get<{ status: string; data: { history: AircraftAlterationHistoryItem[] } }>(
      `/aircraft/${aircraftId}/component-history`,
    );
    return data.data.history;
  },
};
