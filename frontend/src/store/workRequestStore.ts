// Store centralizado para Solicitud de Trabajo (ST) usando Zustand
import { create } from 'zustand';
import {
  WorkRequest,
  WorkRequestVisibleStatus,
  WorkRequestStatus,
  WorkRequestItem,
  WorkRequestItemStatus,
  WorkRequestOrigin,
  findOpenWorkRequestByItem,
} from '../shared/workRequestTypes';
import { mockWorkRequests } from '../shared/workRequestMocks';

const ST_DENSITY_STORAGE_KEY = 'st:viewDensity';

function readInitialDensity(): 'comfortable' | 'compact' {
  if (typeof window === 'undefined') return 'comfortable';
  const savedDensity = window.localStorage.getItem(ST_DENSITY_STORAGE_KEY);
  if (savedDensity === 'compact' || savedDensity === 'comfortable') return savedDensity;
  return 'comfortable';
}

interface WorkRequestStoreState {
  workRequests: WorkRequest[];
  selectedWorkRequestId: string | null;
  selectedDetailSection: 'general' | 'history';
  viewDensity: 'comfortable' | 'compact';
  filterAircraftId: string | null;
  filterStatus: WorkRequestVisibleStatus | null;
  searchText: string;
  setWorkRequests: (reqs: WorkRequest[]) => void;
  selectWorkRequest: (id: string | null, section?: 'general' | 'history') => void;
  setViewDensity: (density: 'comfortable' | 'compact') => void;
  setFilterAircraftId: (id: string | null) => void;
  setFilterStatus: (status: WorkRequestVisibleStatus | null) => void;
  setSearchText: (text: string) => void;
  addWorkRequest: (req: WorkRequest) => void;
  updateWorkRequest: (req: WorkRequest) => void;
  removeWorkRequest: (id: string) => void;
  createWorkRequest: (aircraftId: string) => WorkRequest;
  getDraftWorkRequestByAircraft: (aircraftId: string) => WorkRequest | null;
  addItemToWorkRequest: (workRequestId: string, item: {
    sourceKind: WorkRequestOrigin;
    sourceId: string;
    ataCode: string;
    title: string;
    description: string;
    priority: 'alta' | 'media' | 'baja';
    aircraftHoursAtRequest: number;
    aircraftCyclesAtRequest: number;
    referenceCode?: string;
    regulatoryBasis?: string;
    itemStatus?: WorkRequestItemStatus;
  }) => WorkRequestItem | null;
  removeItemFromWorkRequest: (workRequestId: string, itemId: string) => void;
  sendWorkRequest: (workRequestId: string) => void;
  itemAlreadyInOpenWorkRequest: (sourceKind: WorkRequestOrigin, sourceId: string, excludeWorkRequestId?: string) => WorkRequest | null;
}

export const useWorkRequestStore = create<WorkRequestStoreState>((set, get) => ({
  workRequests: mockWorkRequests,
  selectedWorkRequestId: null,
  selectedDetailSection: 'general',
  viewDensity: readInitialDensity(),
  filterAircraftId: null,
  filterStatus: null,
  searchText: '',
  setWorkRequests: (reqs) => set({ workRequests: reqs }),
  selectWorkRequest: (id, section = 'general') => set({ selectedWorkRequestId: id, selectedDetailSection: section }),
  setViewDensity: (density) => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(ST_DENSITY_STORAGE_KEY, density);
    }
    set({ viewDensity: density });
  },
  setFilterAircraftId: (id) => set({ filterAircraftId: id }),
  setFilterStatus: (status) => set({ filterStatus: status }),
  setSearchText: (text) => set({ searchText: text }),
  addWorkRequest: (req) => set({ workRequests: [req, ...get().workRequests] }),
  updateWorkRequest: (req) => set({
    workRequests: get().workRequests.map((w) => (w.id === req.id ? req : w)),
  }),
  removeWorkRequest: (id) => set({
    workRequests: get().workRequests.filter((w) => w.id !== id),
  }),
  createWorkRequest: (aircraftId) => {
    const existingDraft = get().workRequests.find((wr) => wr.aircraftId === aircraftId && wr.status === WorkRequestStatus.DRAFT);
    if (existingDraft) return existingDraft;

    const nowIso = new Date().toISOString();
    const year = new Date().getFullYear();
    const seq = String(get().workRequests.length + 1).padStart(3, '0');
    const id = `st-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

    const wr: WorkRequest = {
      id,
      folio: `ST-${year}-${seq}`,
      aircraftId,
      status: WorkRequestStatus.DRAFT,
      priority: 'media',
      createdByUserId: 'user-001',
      assignedToOfficeUserId: null,
      createdAt: nowIso,
      updatedAt: nowIso,
      items: [],
      attachments: [],
      statusHistory: [
        {
          id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
          workRequestId: id,
          fromStatus: WorkRequestStatus.DRAFT,
          toStatus: WorkRequestStatus.DRAFT,
          changedByUserId: 'user-001',
          changedAt: nowIso,
          comment: 'ST creada desde bandeja',
        },
      ],
    };

    set({ workRequests: [wr, ...get().workRequests] });
    return wr;
  },
  getDraftWorkRequestByAircraft: (aircraftId) => (
    get().workRequests.find((wr) => wr.aircraftId === aircraftId && wr.status === WorkRequestStatus.DRAFT) ?? null
  ),
  addItemToWorkRequest: (workRequestId, item) => {
    const wr = get().workRequests.find((w) => w.id === workRequestId);
    if (!wr) return null;

    const nowIso = new Date().toISOString();
    const nextItem: WorkRequestItem = {
      id: `item-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      workRequestId,
      sourceKind: item.sourceKind,
      sourceId: item.sourceId,
      ataCode: item.ataCode,
      referenceCode: item.referenceCode ?? item.ataCode,
      title: item.title,
      description: item.description,
      regulatoryBasis: item.regulatoryBasis ?? 'Pendiente',
      priority: item.priority,
      aircraftHoursAtRequest: item.aircraftHoursAtRequest,
      aircraftCyclesAtRequest: item.aircraftCyclesAtRequest,
      dateAtRequest: nowIso.slice(0, 10),
      itemStatus: item.itemStatus ?? WorkRequestItemStatus.PENDING,
      createdAt: nowIso,
      updatedAt: nowIso,
    };

    set({
      workRequests: get().workRequests.map((current) => (
        current.id === workRequestId
          ? { ...current, items: [...current.items, nextItem], updatedAt: nowIso }
          : current
      )),
    });

    return nextItem;
  },
  removeItemFromWorkRequest: (workRequestId, itemId) => {
    const nowIso = new Date().toISOString();
    set({
      workRequests: get().workRequests.map((wr) => (
        wr.id === workRequestId
          ? { ...wr, items: wr.items.filter((it) => it.id !== itemId), updatedAt: nowIso }
          : wr
      )),
    });
  },
  sendWorkRequest: (workRequestId) => {
    const nowIso = new Date().toISOString();
    set({
      workRequests: get().workRequests.map((wr) => {
        if (wr.id !== workRequestId || wr.status !== WorkRequestStatus.DRAFT) return wr;
        return {
          ...wr,
          status: WorkRequestStatus.SENT,
          sentAt: nowIso,
          updatedAt: nowIso,
          statusHistory: [
            ...wr.statusHistory,
            {
              id: `hist-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
              workRequestId,
              fromStatus: wr.status,
              toStatus: WorkRequestStatus.SENT,
              changedByUserId: 'user-001',
              changedAt: nowIso,
              comment: 'ST enviada a Oficina Tecnica',
            },
          ],
        };
      }),
    });
  },
  itemAlreadyInOpenWorkRequest: (sourceKind, sourceId, excludeWorkRequestId) => {
    return findOpenWorkRequestByItem({
      workRequests: get().workRequests,
      sourceKind,
      sourceId,
      excludeWorkRequestId,
    });
  },
}));
