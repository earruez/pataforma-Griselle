import { useWorkRequestStore } from '../store/workRequestStore';
import type { WorkRequestOrigin } from './workRequestTypes';

/**
 * Crea una nueva ST en estado draft y agrega un item automáticamente según el origen.
 * @param sourceType Tipo de origen ("maintenance_plan", "component", etc)
 * @param sourceData Datos mínimos requeridos para el item y la ST
 * @returns Promise<string> id de la ST creada
 */
export async function createSTFromSource(
  sourceType: 'maintenance_plan' | 'component' | 'discrepancy' | 'compliance_due' | 'manual',
  sourceData: {
    aircraftId: string;
    sourceId: string;
    ataCode: string;
    title: string;
    description: string;
    aircraftHoursAtRequest: number;
    aircraftCyclesAtRequest: number;
    priority?: 'alta' | 'media' | 'baja';
  }
): Promise<string> {
  const store = useWorkRequestStore.getState();
  const sourceKind: WorkRequestOrigin = sourceType === 'component' ? 'component_inspection' : sourceType;

  const existingOpen = store.itemAlreadyInOpenWorkRequest(sourceKind, sourceData.sourceId);
  if (existingOpen) return existingOpen.id;

  const draft = store.getDraftWorkRequestByAircraft(sourceData.aircraftId)
    ?? store.createWorkRequest(sourceData.aircraftId);

  store.addItemToWorkRequest(draft.id, {
    sourceKind,
    sourceId: sourceData.sourceId,
    ataCode: sourceData.ataCode || 'N/A',
    title: sourceData.title,
    description: sourceData.description,
    priority: sourceData.priority ?? 'media',
    aircraftHoursAtRequest: sourceData.aircraftHoursAtRequest,
    aircraftCyclesAtRequest: sourceData.aircraftCyclesAtRequest,
    referenceCode: sourceData.ataCode || 'N/A',
    regulatoryBasis: 'Generada desde origen',
  });

  return draft.id;
}
