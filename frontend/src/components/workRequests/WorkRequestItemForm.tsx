import { useState } from 'react';
import { WorkRequestItem, WorkRequestItemStatus, WorkRequestOrigin } from '../../shared/workRequestTypes';
import { validateWorkRequestItemRequiredFields } from '../../shared/workRequestTypes';

interface Props {
  onSave: (item: Omit<WorkRequestItem, 'id' | 'createdAt' | 'updatedAt'>) => void;
  onCancel: () => void;
}

export function WorkRequestItemForm({ onSave, onCancel }: Props) {
  const [sourceKind, setSourceKind] = useState<WorkRequestOrigin>('manual');
  const [sourceId, setSourceId] = useState('');
  const [referenceCode, setReferenceCode] = useState('');
  const [ataCode, setAtaCode] = useState('');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [regulatoryBasis, setRegulatoryBasis] = useState('');
  const [priority, setPriority] = useState<'alta' | 'media' | 'baja'>('media');
  const [aircraftHoursAtRequest, setAircraftHoursAtRequest] = useState(0);
  const [aircraftCyclesAtRequest, setAircraftCyclesAtRequest] = useState(0);
  const [dateAtRequest, setDateAtRequest] = useState('');
  const [error, setError] = useState<string | null>(null);

  const normalizedSourceId = sourceId.trim() || referenceCode.trim();

  return (
    <form
      className="space-y-2"
      onSubmit={e => {
        e.preventDefault();
        const validation = validateWorkRequestItemRequiredFields({
          ataCode,
          referenceCode,
          title,
          description,
          regulatoryBasis,
        });
        if (!validation.ok) {
          setError(validation.message ?? 'Datos incompletos en el item.');
          return;
        }
        setError(null);
        onSave({
          workRequestId: '', // Se asigna al guardar en store
          sourceKind,
          sourceId: normalizedSourceId,
          ataCode,
          referenceCode,
          title,
          description,
          regulatoryBasis,
          priority,
          aircraftHoursAtRequest,
          aircraftCyclesAtRequest,
          dateAtRequest,
          itemStatus: WorkRequestItemStatus.PENDING,
        });
      }}
    >
      <div className="grid grid-cols-2 gap-2">
        <div>
          <label className="block text-xs font-semibold mb-1">Origen</label>
          <select value={sourceKind} onChange={e => setSourceKind(e.target.value as WorkRequestOrigin)} className="input">
            <option value="maintenance_plan">Plan de mantenimiento</option>
            <option value="component_inspection">Componentes/Inspección</option>
            <option value="discrepancy">Discrepancia</option>
            <option value="compliance_due">Cumplimiento vencido</option>
            <option value="manual">Manual</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Referencia</label>
          <input value={referenceCode} onChange={e => setReferenceCode(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">ID origen (opcional)</label>
          <input value={sourceId} onChange={e => setSourceId(e.target.value)} className="input" placeholder="Si se omite, usa referencia" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">ATA</label>
          <input value={ataCode} onChange={e => setAtaCode(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Título</label>
          <input value={title} onChange={e => setTitle(e.target.value)} className="input" />
        </div>
        <div className="col-span-2">
          <label className="block text-xs font-semibold mb-1">Descripción</label>
          <textarea value={description} onChange={e => setDescription(e.target.value)} className="input w-full" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Sustento normativo</label>
          <input value={regulatoryBasis} onChange={e => setRegulatoryBasis(e.target.value)} className="input" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Prioridad</label>
          <select value={priority} onChange={e => setPriority(e.target.value as 'alta' | 'media' | 'baja')} className="input">
            <option value="alta">Alta</option>
            <option value="media">Media</option>
            <option value="baja">Baja</option>
          </select>
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Horas aeronave</label>
          <input type="number" value={aircraftHoursAtRequest} onChange={e => setAircraftHoursAtRequest(Number(e.target.value))} className="input" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Ciclos aeronave</label>
          <input type="number" value={aircraftCyclesAtRequest} onChange={e => setAircraftCyclesAtRequest(Number(e.target.value))} className="input" />
        </div>
        <div>
          <label className="block text-xs font-semibold mb-1">Fecha solicitud</label>
          <input type="date" value={dateAtRequest} onChange={e => setDateAtRequest(e.target.value)} className="input" />
        </div>
      </div>
      {error && <div className="text-xs text-red-700 bg-red-50 border border-red-100 rounded px-2 py-1">{error}</div>}
      <div className="flex gap-2 mt-2">
        <button type="submit" className="btn-primary">Guardar</button>
        <button type="button" className="btn-outline" onClick={onCancel}>Cancelar</button>
      </div>
    </form>
  );
}
