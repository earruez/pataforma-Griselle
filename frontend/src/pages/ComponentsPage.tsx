import { useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { componentApi, type CreateComponentInput } from '@api/component.api';
import { aircraftApi } from '@api/aircraft.api';
import { maintenancePlanApi } from '@api/maintenancePlan.api';
import type { MaintenancePlanItem } from '@api/maintenancePlan.api';
import { complianceApi } from '@api/compliance.api';
import { libraryApi } from '@api/library.api';
import { Package, ChevronDown, X, Loader2 } from 'lucide-react';
import { componentChapterLabel, isComponentChapterTask, isComponentTaskCode } from '@/shared/componentChapterRules';
import { createSTFromSource } from '@/shared/createSTFromSource';
import { useWorkRequestStore } from '../store/workRequestStore';
import { isActiveWorkRequestStatus, WorkRequestStatus } from '@/shared/workRequestTypes';
import { calculateNextDue } from '@/shared/componentDueCalculator';
import { mockComponentApplications, mockComponentMovements } from '@/shared/componentTrackingMocks';
import type { ComponentApplication, ComponentMovement, WorkRequestExecutionType } from '@/shared/componentTrackingTypes';

interface ComponentRow {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  manufacturer: string | null;
  position: string | null;
  tboHours: number | null;
  hoursSinceOverhaul: number | null;
  totalHoursSinceNew: number | null;
  installationDate: string | null;
  aircraftId: string | null;
}

type ExecutionContext = {
  workRequestId: string;
  workOrderNumber: string;
  officeOrderId: string;
};

function RemainingCell({ tbo, used }: { tbo: number | null; used: number | null }) {
  if (tbo == null || used == null) return <span className="text-slate-400">—</span>;
  const rem = tbo - used;
  if (rem <= 0) return <span className="font-semibold text-rose-600">VENCIDO</span>;
  const pct = used / tbo;
  const color = pct >= 0.9 ? 'text-rose-600' : pct >= 0.75 ? 'text-amber-600' : 'text-emerald-700';
  return <span className={`tabular-nums font-medium ${color}`}>{rem.toFixed(1)}</span>;
}

function NewComponentModal({ onClose }: { onClose: () => void }) {
  const qc = useQueryClient();
  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });
  const [form, setForm] = useState<CreateComponentInput>({
    partNumber: '',
    serialNumber: '',
    description: '',
    manufacturer: '',
    aircraftId: null,
    position: null,
    tboHours: null,
    tboCycles: null,
  });

  const mutation = useMutation({
    mutationFn: componentApi.create,
    onSuccess: () => {
      toast.success('Componente creado correctamente');
      qc.invalidateQueries({ queryKey: ['components'] });
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { response?: { data?: { message?: string } } })?.response?.data?.message ?? 'Error al crear componente';
      toast.error(msg);
    },
  });

  const set = <K extends keyof CreateComponentInput>(field: K, value: CreateComponentInput[K]) =>
    setForm((p) => ({ ...p, [field]: value }));

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (!form.partNumber?.trim() || !form.serialNumber?.trim() || !form.description?.trim() || !form.manufacturer?.trim()) {
      toast.error('P/N, N/S, Descripción y Fabricante son obligatorios');
      return;
    }
    mutation.mutate(form);
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-lg bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-2">
            <Package size={16} className="text-brand-600" />
            <h2 className="text-base font-bold text-slate-900">Nuevo Componente</h2>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors">
            <X size={16} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          <div>
            <label className="form-label">Descripción <span className="text-rose-500">*</span></label>
            <input value={form.description} onChange={(e) => set('description', e.target.value)} className="filter-input w-full" />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">P/N <span className="text-rose-500">*</span></label>
              <input value={form.partNumber} onChange={(e) => set('partNumber', e.target.value)} className="filter-input w-full" />
            </div>
            <div>
              <label className="form-label">S/N <span className="text-rose-500">*</span></label>
              <input value={form.serialNumber} onChange={(e) => set('serialNumber', e.target.value)} className="filter-input w-full" />
            </div>
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="form-label">Fabricante <span className="text-rose-500">*</span></label>
              <input value={form.manufacturer} onChange={(e) => set('manufacturer', e.target.value)} className="filter-input w-full" />
            </div>
            <div>
              <label className="form-label">Posición</label>
              <input value={form.position ?? ''} onChange={(e) => set('position', e.target.value || null)} className="filter-input w-full" />
            </div>
          </div>
          <div>
            <label className="form-label">Aeronave</label>
            <select value={form.aircraftId ?? ''} onChange={(e) => set('aircraftId', e.target.value || null)} className="filter-input w-full">
              <option value="">Sin aeronave</option>
              {aircraft.map((a) => (
                <option key={a.id} value={a.id}>{a.registration} — {a.model}</option>
              ))}
            </select>
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <button type="button" onClick={onClose} className="btn-secondary">Cancelar</button>
            <button type="submit" disabled={mutation.isPending} className="btn-primary flex items-center gap-1.5">
              {mutation.isPending ? <Loader2 size={14} className="animate-spin" /> : <Package size={14} />}
              Guardar
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

function resolveIntervalType(task: MaintenancePlanItem): 'hours' | 'cycles' | 'calendar' | 'mixed' {
  const hasHours = task.intervalHours != null && task.intervalHours > 0;
  const hasCycles = task.intervalCycles != null && task.intervalCycles > 0;
  const hasCalendar = (task.intervalCalendarDays != null && task.intervalCalendarDays > 0)
    || (task.intervalCalendarMonths != null && task.intervalCalendarMonths > 0);
  const count = [hasHours, hasCycles, hasCalendar].filter(Boolean).length;
  if (count > 1) return 'mixed';
  if (hasHours) return 'hours';
  if (hasCycles) return 'cycles';
  return 'calendar';
}

function RegisterComponentExecutionModal({
  mode,
  context,
  task,
  aircraftId,
  aircraftHours,
  aircraftCycles,
  existingComponents,
  onClose,
  onSaved,
  onCreateComponent,
  onMovement,
  onApplication,
}: {
  mode: WorkRequestExecutionType;
  context: ExecutionContext;
  task: MaintenancePlanItem;
  aircraftId: string;
  aircraftHours: number;
  aircraftCycles: number;
  existingComponents: ComponentRow[];
  onClose: () => void;
  onSaved: () => void;
  onCreateComponent: () => void;
  onMovement: (movement: ComponentMovement) => void;
  onApplication: (application: ComponentApplication) => void;
}) {
  const [componentId, setComponentId] = useState(existingComponents[0]?.id ?? '');
  const [position, setPosition] = useState(existingComponents[0]?.position ?? '');
  const [newPartNumber, setNewPartNumber] = useState('');
  const [newSerialNumber, setNewSerialNumber] = useState('');
  const [performedAt, setPerformedAt] = useState(new Date().toISOString().slice(0, 16));
  const [hours, setHours] = useState(String(aircraftHours.toFixed(1)));
  const [cycles, setCycles] = useState(String(aircraftCycles));
  const [workOrderNumber, setWorkOrderNumber] = useState(context.workOrderNumber);
  const [notes, setNotes] = useState('');

  const selectedComponent = existingComponents.find((c) => c.id === componentId) ?? null;
  const hasComponents = existingComponents.length > 0;

  const duePreview = useMemo(() => {
    return calculateNextDue({
      intervalType: resolveIntervalType(task),
      intervalHours: task.intervalHours,
      intervalCycles: task.intervalCycles,
      intervalDays: task.intervalCalendarDays ?? (task.intervalCalendarMonths != null ? task.intervalCalendarMonths * 30 : null),
      appliedAt: new Date(performedAt).toISOString(),
      aircraftHoursAtApplication: Number(hours),
      aircraftCyclesAtApplication: Number(cycles),
      currentAircraftHours: aircraftHours,
      currentAircraftCycles: aircraftCycles,
    });
  }, [task, performedAt, hours, cycles, aircraftHours, aircraftCycles]);

  const mutation = useMutation({
    mutationFn: async () => {
      if (!hasComponents) throw new Error('No hay componentes asociados todavía');
      const iso = new Date(performedAt).toISOString();
      const parsedHours = Number(hours);
      const parsedCycles = Number(cycles);
      if (Number.isNaN(new Date(iso).getTime())) throw new Error('Fecha/hora inválida');
      if (!Number.isFinite(parsedHours) || parsedHours < 0) throw new Error('Horas aeronave inválidas');
      if (!Number.isFinite(parsedCycles) || parsedCycles < 0) throw new Error('Ciclos aeronave inválidos');
      if (!position.trim()) throw new Error('Posición obligatoria');
      if (!workOrderNumber.trim()) throw new Error('N° OT obligatorio');

      let targetComponentId = componentId;

      if (mode === 'component_replacement') {
        if (!newPartNumber.trim() || !newSerialNumber.trim()) {
          throw new Error('P/N y S/N nuevos son obligatorios');
        }

        if (targetComponentId) {
          await componentApi.update(targetComponentId, {
            position: `REMOVED ${position.trim()}`,
            notes: `Removido por OT ${workOrderNumber.trim()}`,
          });
        }

        const created = await componentApi.create({
          partNumber: newPartNumber.trim(),
          serialNumber: newSerialNumber.trim(),
          description: task.taskTitle,
          manufacturer: selectedComponent?.manufacturer ?? 'OT EXEC',
          aircraftId,
          position: position.trim(),
        });

        await componentApi.updateInstallation(created.id, {
          aircraftId,
          installationDate: iso,
          position: position.trim(),
          notes: notes.trim() || null,
        });

        targetComponentId = created.id;

        onMovement({
          id: `mov-${Date.now()}`,
          aircraftId,
          position: position.trim(),
          movementType: 'replacement',
          removedComponentInstanceId: componentId || null,
          installedComponentInstanceId: created.id,
          workRequestId: context.workRequestId,
          officeOrderId: context.officeOrderId,
          workOrderNumber: workOrderNumber.trim(),
          performedAt: iso,
          aircraftHoursAtMovement: parsedHours,
          aircraftCyclesAtMovement: parsedCycles,
          notes: notes.trim() || null,
          createdAt: new Date().toISOString(),
          performedByUserName: 'Usuario Operaciones',
        });
      }

      if (!targetComponentId) throw new Error('Selecciona un componente');

      await complianceApi.record({
        aircraftId,
        taskId: task.taskId,
        componentId: targetComponentId,
        performedAt: iso,
        aircraftHoursAtCompliance: parsedHours,
        nextDueHours: duePreview.nextDueHours,
        nextDueCycles: duePreview.nextDueCycles,
        nextDueDate: duePreview.nextDueDate,
        workOrderNumber: workOrderNumber.trim(),
        notes: notes.trim() || null,
      });

      onApplication({
        id: `app-${Date.now()}`,
        componentInstanceId: targetComponentId,
        taskId: task.taskId,
        aircraftId,
        workRequestId: context.workRequestId,
        officeOrderId: context.officeOrderId,
        workOrderNumber: workOrderNumber.trim(),
        appliedAt: iso,
        aircraftHoursAtApplication: parsedHours,
        aircraftCyclesAtApplication: parsedCycles,
        nextDueHours: duePreview.nextDueHours,
        nextDueCycles: duePreview.nextDueCycles,
        nextDueDate: duePreview.nextDueDate,
        notes: notes.trim() || null,
        createdAt: new Date().toISOString(),
      });
    },
    onSuccess: () => {
      toast.success(
        mode === 'component_replacement'
          ? 'Componente registrado correctamente y próximo vencimiento calculado.'
          : 'Aplicación registrada correctamente y próximo vencimiento calculado.',
      );
      onSaved();
      onClose();
    },
    onError: (err: unknown) => {
      const msg = (err as { message?: string }).message ?? 'No se pudo registrar';
      toast.error(msg);
    },
  });

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4">
      <div className="w-full max-w-2xl bg-white rounded-2xl shadow-2xl">
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div>
            <h2 className="text-base font-bold text-slate-900">
              {mode === 'component_replacement' ? 'Registrar cambio ejecutado' : 'Registrar aplicación'}
            </h2>
            <p className="text-xs text-slate-500 mt-0.5">OT {context.workOrderNumber} · {task.taskCode}</p>
          </div>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-slate-100 transition-colors"><X size={16} /></button>
        </div>

        <div className="p-6 space-y-4 max-h-[80vh] overflow-y-auto">
          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Componente asociado</p>
            {!hasComponents ? (
              <div className="mt-2 flex items-center justify-between gap-3 rounded-md border border-slate-200 bg-slate-50 px-3 py-2.5">
                <p className="text-sm text-slate-600">No hay componentes asociados todavía</p>
                <button type="button" className="btn-secondary btn-xs" onClick={onCreateComponent}>+ Crear componente</button>
              </div>
            ) : (
              <div className="mt-2">
                <label className="form-label">Componente <span className="text-rose-500">*</span></label>
                <select className="filter-input w-full" value={componentId} onChange={(e) => setComponentId(e.target.value)}>
                  <option value="">Seleccionar componente</option>
                  {existingComponents.map((c) => (
                    <option key={c.id} value={c.id}>{c.partNumber} / {c.serialNumber} - {c.description}</option>
                  ))}
                </select>
              </div>
            )}
          </div>

          <div className="rounded-lg border border-slate-200 bg-white p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">Datos del registro</p>
            {mode === 'component_replacement' && (
              <div className="grid grid-cols-2 gap-4 mt-2">
                <div>
                  <label className="form-label">P/N nuevo <span className="text-rose-500">*</span></label>
                  <input value={newPartNumber} onChange={(e) => setNewPartNumber(e.target.value)} className="filter-input w-full" />
                </div>
                <div>
                  <label className="form-label">S/N nuevo <span className="text-rose-500">*</span></label>
                  <input value={newSerialNumber} onChange={(e) => setNewSerialNumber(e.target.value)} className="filter-input w-full" />
                </div>
              </div>
            )}
            <div className="grid grid-cols-2 gap-4 mt-3">
              <div>
                <label className="form-label">Fecha/hora <span className="text-rose-500">*</span></label>
                <input type="datetime-local" value={performedAt} onChange={(e) => setPerformedAt(e.target.value)} className="filter-input w-full" />
              </div>
              <div>
                <label className="form-label">Posición <span className="text-rose-500">*</span></label>
                <input value={position} onChange={(e) => setPosition(e.target.value)} className="filter-input w-full" />
              </div>
              <div>
                <label className="form-label">Horas aeronave <span className="text-rose-500">*</span></label>
                <input type="number" min={0} step="0.1" value={hours} onChange={(e) => setHours(e.target.value)} className="filter-input w-full" />
              </div>
              <div>
                <label className="form-label">Ciclos aeronave <span className="text-rose-500">*</span></label>
                <input type="number" min={0} step="1" value={cycles} onChange={(e) => setCycles(e.target.value)} className="filter-input w-full" />
              </div>
              <div>
                <label className="form-label">N° OT <span className="text-rose-500">*</span></label>
                <input value={workOrderNumber} onChange={(e) => setWorkOrderNumber(e.target.value)} className="filter-input w-full" />
              </div>
              <div>
                <label className="form-label">Notas (opcional)</label>
                <input value={notes} onChange={(e) => setNotes(e.target.value)} className="filter-input w-full" />
              </div>
            </div>
          </div>

          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-emerald-700">Próximo cumplimiento calculado</p>
            <p className="text-sm text-emerald-800 mt-1 font-medium">
              {[
                duePreview.nextDueHours != null ? `${duePreview.nextDueHours.toFixed(1)} h` : null,
                duePreview.nextDueCycles != null ? `${duePreview.nextDueCycles} cic` : null,
                duePreview.nextDueDate ? new Date(duePreview.nextDueDate).toLocaleDateString('es-MX') : null,
              ].filter(Boolean).join(' / ') || 'No aplica'}
            </p>
          </div>
        </div>

        <div className="flex justify-end gap-2 px-6 py-4 border-t border-slate-200">
          <button type="button" className="btn-secondary" onClick={onClose}>Cancelar</button>
          <button type="button" className="btn-primary" onClick={() => mutation.mutate()} disabled={mutation.isPending || !hasComponents}>
            {mutation.isPending ? 'Guardando…' : 'Guardar'}
          </button>
        </div>
      </div>
    </div>
  );
}

export default function ComponentsPage() {
  const navigate = useNavigate();
  const qc = useQueryClient();
  const [showModal, setShowModal] = useState(false);
  const [executionDraft, setExecutionDraft] = useState<{
    mode: WorkRequestExecutionType;
    task: MaintenancePlanItem;
    context: ExecutionContext;
  } | null>(null);
  const [expandedComponentId, setExpandedComponentId] = useState<string | null>(null);
  const [componentSearch, setComponentSearch] = useState('');
  const [componentTaskSearch, setComponentTaskSearch] = useState('');
  const [componentMovements, setComponentMovements] = useState<ComponentMovement[]>(mockComponentMovements);
  const [componentApplications, setComponentApplications] = useState<ComponentApplication[]>(mockComponentApplications);
  const [removedComponentIds, setRemovedComponentIds] = useState<string[]>([]);
  const [params, setParams] = useSearchParams();
  const selectedAircraft = params.get('aircraft') ?? '';

  const workRequests = useWorkRequestStore((s) => s.workRequests);
  const selectWorkRequest = useWorkRequestStore((s) => s.selectWorkRequest);

  const { data: aircraft = [] } = useQuery({ queryKey: ['aircraft'], queryFn: aircraftApi.findAll });
  const { data: components = [], isLoading } = useQuery({
    queryKey: ['components', selectedAircraft],
    queryFn: () => (selectedAircraft ? componentApi.findByAircraft(selectedAircraft) : componentApi.findAll()),
  });

  const { data: componentHistory = [], isLoading: loadingComponentHistory } = useQuery({
    queryKey: ['component-compliance-history', expandedComponentId],
    queryFn: () => componentApi.getComplianceHistory(expandedComponentId!),
    enabled: !!expandedComponentId,
    staleTime: 0,
  });

  const { data: planItems = [], isLoading: loadingPlanTasks } = useQuery({
    queryKey: ['components-plan-items', selectedAircraft],
    queryFn: () => maintenancePlanApi.getForAircraft(selectedAircraft),
    enabled: !!selectedAircraft,
    staleTime: 0,
  });

  const { data: templates = [] } = useQuery({
    queryKey: ['library-templates-for-components'],
    queryFn: libraryApi.findAll,
    staleTime: 60000,
  });

  const selectedAircraftData = aircraft.find((a) => a.id === selectedAircraft) ?? null;

  const templateComponentCodes = new Set(
    templates
      .filter((template) =>
        selectedAircraftData
        && template.manufacturer.toUpperCase() === selectedAircraftData.manufacturer.toUpperCase()
        && template.model.toUpperCase() === selectedAircraftData.model.toUpperCase(),
      )
      .flatMap((template) => template.tasks ?? [])
      .filter((task) => isComponentChapterTask({ chapter: task.chapter, section: task.section, taskCode: task.code }))
      .map((task) => task.code),
  );

  const componentChapterTasks = planItems.filter((item) => templateComponentCodes.has(item.taskCode) || isComponentTaskCode(item.taskCode));

  const filteredComponentChapterTasks = useMemo(() => {
    const q = componentTaskSearch.trim().toLowerCase();
    if (!q) return componentChapterTasks;
    return componentChapterTasks.filter((item) =>
      [item.taskCode, item.taskTitle, item.referenceType, item.referenceNumber ?? ''].join(' ').toLowerCase().includes(q),
    );
  }, [componentChapterTasks, componentTaskSearch]);

  const filteredComponents = useMemo(() => {
    const q = componentSearch.trim().toLowerCase();
    if (!q) return components;
    return components.filter((c) => [c.partNumber, c.serialNumber, c.description, c.manufacturer ?? '', c.position ?? ''].join(' ').toLowerCase().includes(q));
  }, [components, componentSearch]);

  const installedComponents = useMemo(
    () => filteredComponents.filter((c) => !removedComponentIds.includes(c.id)),
    [filteredComponents, removedComponentIds],
  );

  const isValidSTForExecution = (wrStatus: WorkRequestStatus, hasOtEvidence: boolean) => {
    const eligibleStatuses = new Set<WorkRequestStatus>([
      WorkRequestStatus.SIGNED_OT_RECEIVED,
      WorkRequestStatus.REGULARIZED,
      WorkRequestStatus.CLOSED,
    ]);
    return eligibleStatuses.has(wrStatus) && hasOtEvidence;
  };

  const isOpenOrDraftST = (wrStatus: WorkRequestStatus) => {
    const openStatuses = new Set<WorkRequestStatus>([
      WorkRequestStatus.DRAFT,
      WorkRequestStatus.SENT,
      WorkRequestStatus.IN_REVIEW,
      WorkRequestStatus.OBSERVED,
      WorkRequestStatus.APPROVED,
    ]);
    return openStatuses.has(wrStatus);
  };

  const componentFlowById = useMemo(() => {
    const map = new Map<string, { openOrDraftStId: string | null; validStId: string | null }>();
    for (const wr of workRequests) {
      if (wr.aircraftId !== selectedAircraft) continue;
      const hasOtEvidence = Boolean(wr.otReference && (wr.otReceivedAt || wr.returnedSignedOtUrl || wr.status === WorkRequestStatus.SIGNED_OT_RECEIVED));
      const isValid = isValidSTForExecution(wr.status, hasOtEvidence);
      const isOpen = isOpenOrDraftST(wr.status);

      if (!isValid && !isOpen) continue;
      for (const item of wr.items) {
        if (item.sourceKind !== 'component_inspection' || !item.sourceId) continue;
        const existing = map.get(item.sourceId) ?? { openOrDraftStId: null, validStId: null };
        if (isValid) existing.validStId = existing.validStId ?? wr.id;
        if (!isValid && isOpen) existing.openOrDraftStId = existing.openOrDraftStId ?? wr.id;
        map.set(item.sourceId, existing);
      }
    }
    return map;
  }, [workRequests, selectedAircraft]);

  const openOrDraftSTByTaskId = useMemo(() => {
    const map = new Map<string, string>();
    for (const wr of workRequests) {
      if (wr.aircraftId !== selectedAircraft) continue;
      if (!isOpenOrDraftST(wr.status)) continue;
      for (const item of wr.items) {
        if (!item.sourceId) continue;
        if (!map.has(item.sourceId)) {
          map.set(item.sourceId, wr.id);
        }
      }
    }
    return map;
  }, [workRequests, selectedAircraft]);

  const replacementIntervalLabel = (item: MaintenancePlanItem) => {
    const parts: string[] = [];
    if (item.intervalHours != null && item.intervalHours > 0) parts.push(`${item.intervalHours} h`);
    if (item.intervalCycles != null && item.intervalCycles > 0) parts.push(`${item.intervalCycles} cic`);
    if (item.intervalCalendarDays != null && item.intervalCalendarDays > 0) parts.push(`${item.intervalCalendarDays} d`);
    if (item.intervalCalendarMonths != null && item.intervalCalendarMonths > 0) parts.push(`${item.intervalCalendarMonths} m`);
    return parts.length > 0 ? parts.join(' / ') : '—';
  };

  const getExecutionBlockMessage = (mode: WorkRequestExecutionType) => (
    mode === 'component_replacement'
      ? 'No existe un item exacto de ST válida con OT recibida/firmada para registrar cambio ejecutado de este componente/tarea.'
      : 'No existe un item exacto de ST válida con OT recibida/firmada para registrar aplicación de esta tarea.'
  );

  const getExecutionContextForTask = (
    task: MaintenancePlanItem,
    mode: WorkRequestExecutionType,
    requiredComponentId?: string,
  ): ExecutionContext | null => {
    for (const wr of workRequests) {
      if (wr.aircraftId !== selectedAircraft) continue;
      const hasOtEvidence = Boolean(wr.otReference && (wr.otReceivedAt || wr.returnedSignedOtUrl || wr.status === WorkRequestStatus.SIGNED_OT_RECEIVED));
      if (!isValidSTForExecution(wr.status, hasOtEvidence)) continue;

      const match = wr.items.find((it) => {
        const linked = it.sourceId === task.taskId;
        if (!linked) return false;
        if (mode === 'component_replacement') {
          return it.executionType === 'component_replacement' && it.requiresComponentTracking === true;
        }
        return it.executionType === 'maintenance_application';
      });

      const hasRequiredComponent = requiredComponentId
        ? wr.items.some((it) => it.sourceKind === 'component_inspection' && it.sourceId === requiredComponentId)
        : true;

      if (match && hasRequiredComponent) {
        return {
          workRequestId: wr.id,
          workOrderNumber: wr.otReference!,
          officeOrderId: `oo-${wr.id}`,
        };
      }
    }
    return null;
  };

  const openExecutionFlow = (
    task: MaintenancePlanItem,
    mode: WorkRequestExecutionType,
    requiredComponentId?: string,
  ) => {
    const context = getExecutionContextForTask(task, mode, requiredComponentId);
    if (!context) {
      toast.error(getExecutionBlockMessage(mode));
      return;
    }
    setExecutionDraft({ mode, task, context });
  };

  const openFromInstalledComponent = (component: ComponentRow, mode: WorkRequestExecutionType) => {
    const task = filteredComponentChapterTasks.find((row) => getExecutionContextForTask(row, mode, component.id));
    if (!task) {
      toast.error(getExecutionBlockMessage(mode));
      return;
    }
    openExecutionFlow(task, mode, component.id);
  };

  return (
    <div className="p-8 space-y-6">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="w-9 h-9 bg-brand-50 rounded-lg flex items-center justify-center">
            <Package size={18} className="text-brand-600" />
          </div>
          <div>
            <h1 className="text-xl font-bold text-slate-900">Componentes (EQ)</h1>
            <p className="text-sm text-slate-500">Vista de componente instalado, trazabilidad y vencimientos.</p>
          </div>
        </div>
        <button className="btn-primary" onClick={() => setShowModal(true)}>+ Nuevo componente</button>
      </div>

      <div className="filter-bar">
        <label className="text-[10px] font-semibold text-slate-500 uppercase tracking-widest shrink-0">Aeronave</label>
        <div className="relative">
          <select
            value={selectedAircraft}
            onChange={(e) => setParams(e.target.value ? { aircraft: e.target.value } : {})}
            className="filter-input pr-8 min-w-48 appearance-none cursor-pointer"
          >
            <option value="">Todas</option>
            {aircraft.map((a) => (
              <option key={a.id} value={a.id}>{a.registration} — {a.model}</option>
            ))}
          </select>
          <ChevronDown size={13} className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 pointer-events-none" />
        </div>
        <input
          type="text"
          value={componentSearch}
          onChange={(e) => setComponentSearch(e.target.value)}
          placeholder="Buscar componente..."
          className="filter-input min-w-72"
        />
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Componentes instalados actualmente</h2>
        </div>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-header">P/N</th>
              <th className="table-header">S/N</th>
              <th className="table-header">Descripción</th>
              <th className="table-header">Posición</th>
              <th className="table-header text-right">Actual (h)</th>
              <th className="table-header text-right">Remanente (h)</th>
              <th className="table-header">Próximo cumplimiento</th>
              <th className="table-header">ST</th>
              <th className="table-header text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={9} className="table-cell text-center text-slate-400 py-12">Cargando…</td></tr>}
            {!isLoading && installedComponents.length === 0 && <tr><td colSpan={9} className="table-cell text-center text-slate-400 py-12">No hay componentes instalados actualmente</td></tr>}
            {installedComponents.map((c: ComponentRow) => {
              const flow = componentFlowById.get(c.id) ?? { openOrDraftStId: null, validStId: null };
              const applicationTask = filteredComponentChapterTasks.find((row) => getExecutionContextForTask(row, 'maintenance_application', c.id)) ?? null;
              const replacementTask = filteredComponentChapterTasks.find((row) => getExecutionContextForTask(row, 'component_replacement', c.id)) ?? null;
              const showExecutionActions = Boolean(flow.validStId);
              return (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell font-mono text-xs text-slate-700">{c.partNumber}</td>
                  <td className="table-cell font-mono text-xs text-slate-700">{c.serialNumber}</td>
                  <td className="table-cell text-slate-700">{c.description}</td>
                  <td className="table-cell text-slate-500">{c.position ?? '—'}</td>
                  <td className="table-cell text-right tabular-nums">{c.hoursSinceOverhaul != null ? Number(c.hoursSinceOverhaul).toFixed(1) : '—'}</td>
                  <td className="table-cell text-right"><RemainingCell tbo={c.tboHours} used={c.hoursSinceOverhaul ?? c.totalHoursSinceNew} /></td>
                  <td className="table-cell text-xs text-slate-500">{c.installationDate ? new Date(c.installationDate).toLocaleDateString('es-MX') : '—'}</td>
                  <td className="table-cell text-xs text-slate-600">
                    {flow.validStId ? 'OT recibida/firmada' : flow.openOrDraftStId ? 'Abierta/Borrador' : 'Sin ST'}
                  </td>
                  <td className="table-cell text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        className="btn-secondary btn-xs"
                        onClick={() => setExpandedComponentId(c.id)}
                      >
                        Ver historial
                      </button>
                      {!showExecutionActions && !flow.openOrDraftStId && (
                        <button
                          className="btn-primary btn-xs"
                          onClick={async () => {
                            if (!c.aircraftId) {
                              toast.error('El componente debe estar asociado a una aeronave para agregarlo a ST');
                              return;
                            }
                            const stId = await createSTFromSource('component', {
                              aircraftId: c.aircraftId,
                              sourceId: c.id,
                              ataCode: c.partNumber,
                              title: c.description,
                              description: 'Accion requerida',
                              aircraftHoursAtRequest: selectedAircraftData?.totalFlightHours ?? 0,
                              aircraftCyclesAtRequest: selectedAircraftData?.totalCycles ?? 0,
                              priority: 'media',
                            });
                            selectWorkRequest(stId, 'general');
                            navigate(`/work-requests?aircraftId=${encodeURIComponent(c.aircraftId)}&stId=${stId}`);
                          }}
                        >
                          Agregar a ST
                        </button>
                      )}
                      {!showExecutionActions && flow.openOrDraftStId && (
                        <button
                          className="btn-secondary btn-xs"
                          onClick={() => {
                            selectWorkRequest(flow.openOrDraftStId!, 'general');
                            navigate(`/work-requests?aircraftId=${encodeURIComponent(c.aircraftId ?? selectedAircraft)}&stId=${flow.openOrDraftStId}`);
                          }}
                        >
                          Ver ST
                        </button>
                      )}
                      {showExecutionActions && applicationTask && (
                        <button className="btn-secondary btn-xs" onClick={() => openExecutionFlow(applicationTask, 'maintenance_application', c.id)}>
                          Registrar aplicación
                        </button>
                      )}
                      {showExecutionActions && replacementTask && (
                        <button className="btn-primary btn-xs" onClick={() => openExecutionFlow(replacementTask, 'component_replacement', c.id)}>
                          Registrar cambio ejecutado
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {expandedComponentId && (
        <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
          <div className="px-5 py-4 border-b border-slate-100">
            <h2 className="text-sm font-bold text-slate-900">Historial del componente seleccionado</h2>
          </div>
          {loadingComponentHistory ? (
            <div className="px-5 py-10 text-sm text-slate-400">Cargando historial…</div>
          ) : componentHistory.length === 0 ? (
            <div className="px-5 py-10 text-sm text-slate-400">Sin registros para este componente.</div>
          ) : (
            <div className="p-5 space-y-2">
              {componentHistory.map((h) => (
                <div key={h.id} className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs">
                  <p className="font-mono text-slate-700">{h.task.code} · {h.task.title}</p>
                  <p className="text-slate-500 mt-1">{new Date(h.performedAt).toLocaleString('es-MX')} · OT {h.workOrderNumber ?? '—'}</p>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Tareas de componente desde plan</h2>
          <p className="text-xs text-slate-500 mt-1">Capítulos considerados: {componentChapterLabel}</p>
          <div className="mt-3">
            <input
              type="text"
              value={componentTaskSearch}
              onChange={(e) => setComponentTaskSearch(e.target.value)}
              placeholder="Buscar tarea de componente..."
              className="filter-input w-full md:w-96"
            />
          </div>
        </div>
        {!selectedAircraft ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">Selecciona una aeronave para ver sus tareas de componente.</div>
        ) : loadingPlanTasks ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">Cargando tareas de componente...</div>
        ) : filteredComponentChapterTasks.length === 0 ? (
          <div className="px-5 py-10 text-sm text-slate-400 text-center">No hay tareas de componente para esta aeronave.</div>
        ) : (
          <table className="min-w-full divide-y divide-slate-100 text-sm">
            <thead className="bg-slate-50">
              <tr>
                <th className="table-header">Tarea</th>
                <th className="table-header">Descripción</th>
                <th className="table-header">Intervalo</th>
                <th className="table-header">Próximo cumplimiento</th>
                <th className="table-header">Estado</th>
                <th className="table-header">Tracking</th>
                <th className="table-header">Solicitud</th>
                <th className="table-header text-center">Acciones</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredComponentChapterTasks.map((item) => {
                const appContext = getExecutionContextForTask(item, 'maintenance_application');
                const replacementContext = getExecutionContextForTask(item, 'component_replacement');
                const openStId = openOrDraftSTByTaskId.get(item.taskId) ?? null;

                return (
                <tr key={item.taskId} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell font-mono text-xs text-slate-700">{item.taskCode}</td>
                  <td className="table-cell text-slate-700">{item.taskTitle}</td>
                  <td className="table-cell text-xs text-slate-600">{replacementIntervalLabel(item)}</td>
                  <td className="table-cell text-xs text-slate-600">
                    {[
                      item.nextDueHours != null ? `${item.nextDueHours.toFixed(1)} h` : null,
                      item.nextDueCycles != null ? `${item.nextDueCycles} cic` : null,
                      item.nextDueDate ? new Date(item.nextDueDate).toLocaleDateString('es-MX') : null,
                    ].filter(Boolean).join(' / ') || '—'}
                  </td>
                  <td className="table-cell text-xs text-slate-600">{item.status}</td>
                  <td className="table-cell text-xs text-slate-600">{isComponentTaskCode(item.taskCode) ? 'Requiere componente' : 'Aplicación'}</td>
                  <td className="table-cell text-xs text-slate-600">{appContext || replacementContext ? 'OT recibida/firmada' : openStId ? 'Abierta/Borrador' : 'Sin solicitud'}</td>
                  <td className="table-cell text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {!appContext && !replacementContext && !openStId && (
                        <button
                          className="btn-primary btn-xs"
                          onClick={async () => {
                            if (!selectedAircraft) {
                              toast.error('Selecciona una aeronave para agregar la tarea a ST');
                              return;
                            }
                            const stId = await createSTFromSource('maintenance_plan', {
                              aircraftId: selectedAircraft,
                              sourceId: item.taskId,
                              ataCode: item.taskCode,
                              title: item.taskTitle,
                              description: 'Accion requerida',
                              aircraftHoursAtRequest: selectedAircraftData?.totalFlightHours ?? 0,
                              aircraftCyclesAtRequest: selectedAircraftData?.totalCycles ?? 0,
                              priority: 'media',
                            });
                            selectWorkRequest(stId, 'general');
                            navigate(`/work-requests?aircraftId=${encodeURIComponent(selectedAircraft)}&stId=${stId}`);
                          }}
                        >
                          Agregar a ST
                        </button>
                      )}
                      {!appContext && !replacementContext && openStId && (
                        <button
                          className="btn-secondary btn-xs"
                          onClick={() => {
                            selectWorkRequest(openStId, 'general');
                            navigate(`/work-requests?aircraftId=${encodeURIComponent(selectedAircraft)}&stId=${openStId}`);
                          }}
                        >
                          Ver ST
                        </button>
                      )}
                      {appContext && (
                        <button className="btn-secondary btn-xs" onClick={() => openExecutionFlow(item, 'maintenance_application')}>
                          Registrar aplicación
                        </button>
                      )}
                      {replacementContext && (
                        <button className="btn-primary btn-xs" onClick={() => openExecutionFlow(item, 'component_replacement')}>
                          Registrar cambio ejecutado
                        </button>
                      )}
                    </div>
                  </td>
                </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Historial de movimientos</h2>
        </div>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-header">Fecha</th>
              <th className="table-header">Posición</th>
              <th className="table-header">Movimiento</th>
              <th className="table-header">Hrs</th>
              <th className="table-header">Ciclos</th>
              <th className="table-header">ST</th>
              <th className="table-header">OT</th>
              <th className="table-header">Usuario</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {componentMovements.map((row) => (
              <tr key={row.id}>
                <td className="table-cell text-xs text-slate-600">{new Date(row.performedAt).toLocaleString('es-MX')}</td>
                <td className="table-cell text-xs text-slate-700">{row.position}</td>
                <td className="table-cell text-xs text-slate-700">{row.movementType}</td>
                <td className="table-cell text-xs text-slate-700 tabular-nums">{row.aircraftHoursAtMovement.toFixed(1)}</td>
                <td className="table-cell text-xs text-slate-700 tabular-nums">{row.aircraftCyclesAtMovement}</td>
                <td className="table-cell text-xs text-slate-700">{row.workRequestId}</td>
                <td className="table-cell text-xs text-slate-700">{row.workOrderNumber}</td>
                <td className="table-cell text-xs text-slate-500">{row.performedByUserName}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="bg-white rounded-xl border border-slate-200 shadow-card overflow-x-auto">
        <div className="px-5 py-4 border-b border-slate-100">
          <h2 className="text-sm font-bold text-slate-900">Historial de aplicaciones</h2>
        </div>
        <table className="min-w-full divide-y divide-slate-100 text-sm">
          <thead className="bg-slate-50">
            <tr>
              <th className="table-header">Fecha</th>
              <th className="table-header">Tarea ATA</th>
              <th className="table-header">Horas al aplicar</th>
              <th className="table-header">Ciclos al aplicar</th>
              <th className="table-header">Próximo cumplimiento</th>
              <th className="table-header">OT</th>
              <th className="table-header">Notas</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {componentApplications.map((row) => (
              <tr key={row.id}>
                <td className="table-cell text-xs text-slate-600">{new Date(row.appliedAt).toLocaleString('es-MX')}</td>
                <td className="table-cell text-xs text-slate-700">{row.taskId}</td>
                <td className="table-cell text-xs text-slate-700 tabular-nums">{row.aircraftHoursAtApplication.toFixed(1)}</td>
                <td className="table-cell text-xs text-slate-700 tabular-nums">{row.aircraftCyclesAtApplication}</td>
                <td className="table-cell text-xs text-slate-700">
                  {[
                    row.nextDueHours != null ? `${row.nextDueHours.toFixed(1)} h` : null,
                    row.nextDueCycles != null ? `${row.nextDueCycles} cic` : null,
                    row.nextDueDate ? new Date(row.nextDueDate).toLocaleDateString('es-MX') : null,
                  ].filter(Boolean).join(' / ') || '—'}
                </td>
                <td className="table-cell text-xs text-slate-700">{row.workOrderNumber}</td>
                <td className="table-cell text-xs text-slate-500">{row.notes ?? '—'}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {showModal && <NewComponentModal onClose={() => setShowModal(false)} />}

      {executionDraft && selectedAircraftData && (
        <RegisterComponentExecutionModal
          mode={executionDraft.mode}
          context={executionDraft.context}
          task={executionDraft.task}
          aircraftId={selectedAircraftData.id}
          aircraftHours={selectedAircraftData.totalFlightHours}
          aircraftCycles={selectedAircraftData.totalCycles}
          existingComponents={installedComponents as ComponentRow[]}
          onClose={() => setExecutionDraft(null)}
          onCreateComponent={() => {
            setExecutionDraft(null);
            setShowModal(true);
          }}
          onMovement={(movement) => {
            setComponentMovements((prev) => [movement, ...prev]);
            if (movement.removedComponentInstanceId) {
              setRemovedComponentIds((prev) => [...prev, movement.removedComponentInstanceId!]);
            }
          }}
          onApplication={(application) => setComponentApplications((prev) => [application, ...prev])}
          onSaved={() => {
            qc.invalidateQueries({ queryKey: ['components', selectedAircraft] });
            qc.invalidateQueries({ queryKey: ['components-plan-items', selectedAircraft] });
            qc.invalidateQueries({ queryKey: ['maintenance-plan', selectedAircraft] });
          }}
        />
      )}
    </div>
  );
}
