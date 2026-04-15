import { useState, useRef, type ChangeEvent } from 'react';
import { WorkRequest, WorkRequestItem } from '../../shared/workRequestTypes';
import { WorkRequestItemForm } from './WorkRequestItemForm';
import { useWorkRequestStore } from '../../store/workRequestStore';
import {
  findActiveWorkRequestByMaintenanceTaskId,
  getVisibleSTStatusLabel,
  WorkRequestStatus,
  canEditWorkRequest,
  canSendToTechnicalOffice,
  canRegularizeCompliance,
} from '../../shared/workRequestTypes';
import { saveAs } from 'file-saver';

const REQUIRE_EVIDENCE_TO_SEND = true;

export function WorkRequestActionsPanel({ workRequest }: { workRequest: WorkRequest }) {
  const [adding, setAdding] = useState(false);
  const [validationMessage, setValidationMessage] = useState<string | null>(null);
  const [duplicateConflict, setDuplicateConflict] = useState<{
    item: Omit<WorkRequestItem, 'id' | 'createdAt' | 'updatedAt'>;
    existingWorkRequestId: string;
  } | null>(null);
  const updateWorkRequest = useWorkRequestStore(s => s.updateWorkRequest);
  const workRequests = useWorkRequestStore(s => s.workRequests);
  const selectWorkRequest = useWorkRequestStore(s => s.selectWorkRequest);
  const fileInputRef = useRef<HTMLInputElement>(null);

  function persistItem(
    item: Omit<WorkRequestItem, 'id' | 'createdAt' | 'updatedAt'>,
    forceDuplicate: boolean,
  ) {
    const duplicateNote = forceDuplicate
      ? 'Item duplicado confirmado por usuario pese a ST activa previa.'
      : undefined;

    const newItem: WorkRequestItem = {
      ...item,
      id: 'item-' + Math.random().toString(36).slice(2, 9),
      workRequestId: workRequest.id,
      notes: duplicateNote,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    updateWorkRequest({
      ...workRequest,
      items: [...workRequest.items, newItem],
      updatedAt: new Date().toISOString(),
      statusHistory: forceDuplicate
        ? [
            ...workRequest.statusHistory,
            {
              id: 'hist-' + Math.random().toString(36).slice(2, 9),
              workRequestId: workRequest.id,
              fromStatus: workRequest.status,
              toStatus: workRequest.status,
              changedByUserId: 'user-001',
              changedAt: new Date().toISOString(),
              comment: 'Se confirmo creacion de ST duplicada para misma tarea.',
            },
          ]
        : workRequest.statusHistory,
    });

    setDuplicateConflict(null);
    setValidationMessage(null);
    setAdding(false);
  }

  function handleSave(item: Omit<WorkRequestItem, 'id' | 'createdAt' | 'updatedAt'>) {
    if (!canEditWorkRequest(workRequest.status)) {
      setValidationMessage('Solo puedes editar cuando esta en Borrador.');
      return;
    }

    // Regla: no duplicar ST activa sobre la misma tarea de mantenimiento.
    const maintenanceTaskId = item.sourceKind === 'maintenance_plan' ? item.sourceId.trim() : '';
    if (maintenanceTaskId) {
      const existingActive = findActiveWorkRequestByMaintenanceTaskId({
        workRequests,
        aircraftId: workRequest.aircraftId,
        maintenanceTaskId,
        excludeWorkRequestId: workRequest.id,
      });

      if (existingActive) {
        setValidationMessage('Esta tarea ya tiene una solicitud activa');
        setDuplicateConflict({
          item,
          existingWorkRequestId: existingActive.id,
        });
        return;
      }
    }

    persistItem(item, false);
  }

  function handleAttachFile(e: ChangeEvent<HTMLInputElement>) {
    if (!canEditWorkRequest(workRequest.status)) {
      setValidationMessage('Solo puedes adjuntar archivos en Borrador.');
      return;
    }

    const file = e.target.files?.[0];
    if (!file) return;
    const id = 'att-' + Math.random().toString(36).slice(2, 9);
    const url = URL.createObjectURL(file); // Solo mock, en real sería upload
    updateWorkRequest({
      ...workRequest,
      attachments: [
        ...workRequest.attachments,
        {
          id,
          workRequestId: workRequest.id,
          fileName: file.name,
          fileUrl: url,
          fileType: file.type,
          uploadedByUserId: 'user-001',
          uploadedAt: new Date().toISOString(),
        },
      ],
      updatedAt: new Date().toISOString(),
    });
    setValidationMessage(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  function handleSaveDraft() {
    if (!canEditWorkRequest(workRequest.status)) return;
    updateWorkRequest({
      ...workRequest,
      status: WorkRequestStatus.DRAFT,
      updatedAt: new Date().toISOString(),
      statusHistory: [
        ...workRequest.statusHistory,
        {
          id: 'hist-' + Math.random().toString(36).slice(2, 9),
          workRequestId: workRequest.id,
          fromStatus: workRequest.status,
          toStatus: WorkRequestStatus.DRAFT,
          changedByUserId: 'user-001',
          changedAt: new Date().toISOString(),
        },
      ],
    });
  }

  function handleSendToTechnicalOffice() {
    if (!canSendToTechnicalOffice(workRequest.status)) return;

    if (workRequest.items.length === 0) {
      setValidationMessage('Agrega al menos un item antes de enviar.');
      return;
    }

    if (REQUIRE_EVIDENCE_TO_SEND && workRequest.attachments.length === 0) {
      setValidationMessage('Adjunta al menos un archivo antes de enviar a Oficina Tecnica.');
      return;
    }

    updateWorkRequest({
      ...workRequest,
      status: WorkRequestStatus.SENT,
      sentAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      statusHistory: [
        ...workRequest.statusHistory,
        {
          id: 'hist-' + Math.random().toString(36).slice(2, 9),
          workRequestId: workRequest.id,
          fromStatus: workRequest.status,
          toStatus: WorkRequestStatus.SENT,
          changedByUserId: 'user-001',
          changedAt: new Date().toISOString(),
        },
      ],
    });
    setValidationMessage(null);
  }

  function handleRegularizeCompliance() {
    if (!canRegularizeCompliance({
      status: workRequest.status,
      returnedSignedOtUrl: workRequest.returnedSignedOtUrl,
      otReference: workRequest.otReference,
    })) {
      setValidationMessage('Necesitas una OT firmada para cerrar este ciclo.');
      return;
    }

    updateWorkRequest({
      ...workRequest,
      status: WorkRequestStatus.REGULARIZED,
      updatedAt: new Date().toISOString(),
      statusHistory: [
        ...workRequest.statusHistory,
        {
          id: 'hist-' + Math.random().toString(36).slice(2, 9),
          workRequestId: workRequest.id,
          fromStatus: workRequest.status,
          toStatus: WorkRequestStatus.REGULARIZED,
          changedByUserId: 'user-001',
          changedAt: new Date().toISOString(),
        },
      ],
    });
    setValidationMessage(null);
  }

  function handleGeneratePDF() {
    const content = `Solicitud de Trabajo\n\nN° ST: ${workRequest.folio}\nAeronave: ${workRequest.aircraftId}\nPrioridad: ${workRequest.priority}\nEstado: ${getVisibleSTStatusLabel(workRequest.status)}\n\nItems:\n${workRequest.items.map(i => `- ${i.title} (${i.ataCode})`).join('\n')}`;
    const blob = new Blob([content], { type: 'application/pdf' });
    saveAs(blob, `${workRequest.folio}.pdf`);
  }

  return (
    <div className="bg-white rounded-xl border p-4 flex flex-col gap-3">
      {adding ? (
        <WorkRequestItemForm
          onSave={handleSave}
          onCancel={() => {
            setDuplicateConflict(null);
            setAdding(false);
          }}
        />
      ) : (
        <>
          <button className="btn-primary" onClick={() => setAdding(true)} disabled={!canEditWorkRequest(workRequest.status)}>Agregar item</button>
          <button className="btn-outline" onClick={() => fileInputRef.current?.click()} disabled={!canEditWorkRequest(workRequest.status)}>Adjuntar archivo</button>
          <input
            ref={fileInputRef}
            type="file"
            className="hidden"
            onChange={handleAttachFile}
            accept="image/*,application/pdf"
          />
          <button className="btn-outline" onClick={handleSaveDraft} disabled={!canEditWorkRequest(workRequest.status)}>Guardar borrador</button>
          <button className="btn-outline" onClick={handleGeneratePDF}>Generar PDF</button>
          <button className="btn-success" onClick={handleSendToTechnicalOffice} disabled={!canSendToTechnicalOffice(workRequest.status)}>Enviar a Oficina Técnica</button>
          <button
            className="btn-warning"
            onClick={handleRegularizeCompliance}
            disabled={!canRegularizeCompliance({
              status: workRequest.status,
              returnedSignedOtUrl: workRequest.returnedSignedOtUrl,
              otReference: workRequest.otReference,
            })}
          >
            Regularizar cumplimiento
          </button>
          {validationMessage && (
            <div className="text-xs text-amber-800 bg-amber-50 border border-amber-100 rounded px-2 py-1">
              {validationMessage}
            </div>
          )}
        </>
      )}
      {duplicateConflict && (
        <div className="text-xs text-amber-900 bg-amber-50 border border-amber-200 rounded px-2 py-2 space-y-2">
          <p className="font-semibold">Esta tarea ya tiene una solicitud activa</p>
          <div className="flex flex-wrap gap-2">
            <button
              className="btn-xs btn-outline"
              onClick={() => selectWorkRequest(duplicateConflict.existingWorkRequestId, 'general')}
            >
              Ver ST existente
            </button>
            <button
              className="btn-xs btn-warning"
              onClick={() => persistItem(duplicateConflict.item, true)}
            >
              Crear nueva de todos modos
            </button>
            <button
              className="btn-xs btn-outline"
              onClick={() => setDuplicateConflict(null)}
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
