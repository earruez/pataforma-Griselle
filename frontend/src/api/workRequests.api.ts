import { apiClient } from './client';

export type WorkRequestStatus = 'DRAFT' | 'SENT' | 'CANCELLED';
export type WorkRequestItemCategory = 'MAINTENANCE_PLAN' | 'NORMATIVE' | 'COMPONENT_INSPECTION' | 'DISCREPANCY' | 'OTHER';

export interface WorkRequestTask {
  id: string;
  taskId: string | null;
  componentId?: string | null;
  discrepancyId?: string | null;
  source: string;
  category: WorkRequestItemCategory;
  itemCode: string | null;
  itemTitle: string;
  itemDescription: string | null;
  task?: {
    id: string;
    code: string;
    title: string;
    description: string;
    intervalHours: number | null;
    intervalCycles: number | null;
    intervalCalendarDays: number | null;
  } | null;
}

export interface WorkRequest {
  id: string;
  number: string;
  status: WorkRequestStatus;
  responsibleId: string | null;
  notes: string | null;
  aircraftId: string;
  items: WorkRequestTask[];
  responsible?: { id: string; name: string; email: string } | null;
}

export interface WorkRequestResponsible {
  id: string;
  name: string;
  email: string;
  role: string;
}

export interface WorkRequestCatalog {
  maintenancePlan: Array<{ taskId: string; taskCode: string; taskTitle: string; hoursRemaining: number | null; daysRemaining: number | null; status: string }>;
  normative: Array<{ taskId: string; taskCode: string; taskTitle: string; referenceNumber: string | null }>;
  componentInspection: Array<{ taskId: string; taskCode: string; taskTitle: string; referenceNumber: string | null }>;
  components: Array<{ id: string; partNumber: string; serialNumber: string; description: string; position: string | null }>;
  discrepancies: Array<{ id: string; code: string; title: string; description: string; status: string }>;
}

export interface AirworthinessHistoryRow {
  id: string;
  date: string;
  taskCode: string;
  taskTitle: string;
  flightHours: number;
  cycles: number;
  legalBasis: string;
  evidenceUrl: string | null;
  workRequestNumber: string | null;
}

export const workRequestsApi = {
  async listByAircraft(aircraftId: string): Promise<WorkRequest[]> {
    const { data } = await apiClient.get<{ status: string; data: WorkRequest[] }>(`/work-requests/aircraft/${aircraftId}`);
    return data.data;
  },

  async createDraft(aircraftId: string, taskIds?: string[]): Promise<WorkRequest> {
    const { data } = await apiClient.post<{ status: string; data: WorkRequest }>('/work-requests', { aircraftId, taskIds });
    return data.data;
  },

  async getById(id: string): Promise<WorkRequest> {
    const { data } = await apiClient.get<{ status: string; data: WorkRequest }>(`/work-requests/${id}`);
    return data.data;
  },

  async updateDraft(id: string, payload: { responsibleId?: string | null; notes?: string | null }) {
    const { data } = await apiClient.patch<{ status: string; data: WorkRequest }>(`/work-requests/${id}`, payload);
    return data.data;
  },

  async addItem(id: string, payload: {
    taskId?: string;
    componentId?: string;
    discrepancyId?: string;
    category?: WorkRequestItemCategory;
    code?: string | null;
    title?: string;
    description?: string | null;
  }): Promise<WorkRequest> {
    const { data } = await apiClient.post<{ status: string; data: WorkRequest }>(`/work-requests/${id}/items`, payload);
    return data.data;
  },

  async removeItem(id: string, itemId: string): Promise<WorkRequest> {
    const { data } = await apiClient.delete<{ status: string; data: WorkRequest }>(`/work-requests/${id}/items/${itemId}`);
    return data.data;
  },

  async getCatalog(aircraftId: string, search?: string): Promise<WorkRequestCatalog> {
    const { data } = await apiClient.get<{ status: string; data: WorkRequestCatalog }>(
      `/work-requests/aircraft/${aircraftId}/catalog`,
      { params: { search } },
    );
    return data.data;
  },

  async listResponsibles(): Promise<WorkRequestResponsible[]> {
    const { data } = await apiClient.get<{ status: string; data: WorkRequestResponsible[] }>('/work-requests/responsibles');
    return data.data;
  },

  getPdfUrl(id: string): string {
    return `/api/v1/work-requests/${id}/pdf`;
  },

  async sendEmail(id: string, email?: string): Promise<void> {
    await apiClient.post(`/work-requests/${id}/send-email`, { email });
  },

  async closeAndComply(
    id: string,
    payload: {
      aircraftHoursAtClose: number;
      aircraftCyclesN1AtClose: number;
      aircraftCyclesN2AtClose: number;
      notes?: string;
      closedAt?: string;
      evidenceFile?: File;
      evidenceUrl?: string;
      evidenceFileName?: string;
    },
  ): Promise<{ generatedCompliances: number }> {
    const form = new FormData();
    form.append('aircraftHoursAtClose', String(payload.aircraftHoursAtClose));
    form.append('aircraftCyclesN1AtClose', String(payload.aircraftCyclesN1AtClose));
    form.append('aircraftCyclesN2AtClose', String(payload.aircraftCyclesN2AtClose));
    if (payload.notes) form.append('notes', payload.notes);
    if (payload.closedAt) form.append('closedAt', payload.closedAt);
    if (payload.evidenceFile) form.append('evidence', payload.evidenceFile);
    if (payload.evidenceUrl) form.append('evidenceUrl', payload.evidenceUrl);
    if (payload.evidenceFileName) form.append('evidenceFileName', payload.evidenceFileName);

    const { data } = await apiClient.post<{ status: string; data: { generatedCompliances: number } }>(
      `/work-requests/${id}/close-and-comply`,
      form,
      { headers: { 'Content-Type': 'multipart/form-data' } },
    );
    return data.data;
  },

  async getAirworthinessHistory(aircraftId: string): Promise<AirworthinessHistoryRow[]> {
    const { data } = await apiClient.get<{ status: string; data: AirworthinessHistoryRow[] }>(
      `/work-requests/aircraft/${aircraftId}/airworthiness-history`,
    );
    return data.data;
  },
};
