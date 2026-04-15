import { type ReactNode, useMemo, useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { toast } from 'react-hot-toast';
import { componentApi, type ComponentComplianceRecord, type CreateComponentInput } from '@api/component.api';
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
import { calculateComponentDue, calculateNextDue } from '@/shared/componentDueCalculator';
import { mockComponentApplications, mockComponentMovements } from '@/shared/componentTrackingMocks';
import type {
  AircraftSnapshot,
  ComponentApplication,
  ComponentDefinition,
  ComponentMovement,
  WorkRequestExecutionType,
} from '@/shared/componentTrackingTypes';

interface ComponentRow {
  id: string;
  partNumber: string;
  serialNumber: string;
  description: string;
  manufacturer: string | null;
  position: string | null;
  tboHours: number | null;
  tboCycles: number | null;
  hoursSinceOverhaul: number | null;
  cyclesSinceOverhaul: number | null;
  totalHoursSinceNew: number | null;
  totalCyclesSinceNew: number | null;
  installationDate: string | null;
  aircraftId: string | null;
}

type ExecutionContext = {
  workRequestId: string;
  workOrderNumber: string;
  officeOrderId: string;
};

type CriticalBy = 'hours' | 'cycles' | 'calendar' | 'none';

function renderMetricPills(
  entries: Array<{ key: Exclude<CriticalBy, 'none'>; label: string }>,
  criticalBy: CriticalBy,
): ReactNode {
  if (entries.length === 0) return <span className="text-slate-400">—</span>;

  return (
    <div className="flex flex-wrap items-center gap-1">
      {entries.map((entry) => (
        <span
          key={entry.key}
          className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${
            criticalBy === entry.key
              ? 'border-amber-300 bg-amber-50 text-amber-700'
              : 'border-slate-200 bg-slate-50 text-slate-600'
          }`}
        >
          {entry.label}
        </span>
      ))}
    </div>
  );
}

type VisibleComponentState = 'Sin registro' | 'Próx. vencer' | 'Vencida' | 'En ST' | 'OT recibida' | 'Al día / Ejecutado';
type TimelineEventType = 'installation' | 'application' | 'removal' | 'replacement';

interface TimelineEvent {
  id: string;
  type: TimelineEventType;
  occurredAt: string;
  title: string;
  details: string[];
  stRef: string | null;
  otRef: string | null;
}

function visibleStateBadge(state: VisibleComponentState) {
  if (state === 'Vencida') {
    return <span className="inline-flex rounded-full border border-rose-200 bg-rose-50 px-2 py-0.5 text-[11px] font-semibold text-rose-700">Vencida</span>;
  }
  if (state === 'Próx. vencer') {
    return <span className="inline-flex rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[11px] font-semibold text-amber-700">Próx. vencer</span>;
  }
  if (state === 'En ST') {
    return <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">En ST</span>;
  }
  if (state === 'OT recibida') {
    return <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">OT recibida</span>;
  }
  if (state === 'Al día / Ejecutado') {
    return <span className="inline-flex rounded-full border border-emerald-200 bg-emerald-50 px-2 py-0.5 text-[11px] font-semibold text-emerald-700">Al día / Ejecutado</span>;
  }
  return <span className="inline-flex rounded-full border border-slate-200 bg-slate-50 px-2 py-0.5 text-[11px] font-semibold text-slate-700">Sin registro</span>;
}

function timelineStyle(type: TimelineEventType): { dot: string; badge: string; label: string } {
  if (type === 'installation') return { dot: 'bg-blue-500', badge: 'bg-blue-50 text-blue-700 border-blue-200', label: 'Instalación' };
  if (type === 'application') return { dot: 'bg-emerald-500', badge: 'bg-emerald-50 text-emerald-700 border-emerald-200', label: 'Aplicación' };
  if (type === 'removal') return { dot: 'bg-slate-400', badge: 'bg-slate-50 text-slate-700 border-slate-200', label: 'Remoción' };
  return { dot: 'bg-amber-500', badge: 'bg-amber-50 text-amber-700 border-amber-200', label: 'Reemplazo' };
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
          // These fields are sent for forward compatibility if backend supports instance metadata.
          definitionId: task.taskId,
          status: 'installed',
        } as CreateComponentInput & { definitionId: string; status: 'installed' });

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
          removedPartNumber: selectedComponent?.partNumber ?? null,
          removedSerialNumber: selectedComponent?.serialNumber ?? null,
          installedPartNumber: newPartNumber.trim(),
          installedSerialNumber: newSerialNumber.trim(),
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
  const qc = useQueryClient();
  const navigate = useNavigate();
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

  const { data: bulkComponentApplications = [] } = useQuery({
    queryKey: ['component-applications-bulk', selectedAircraft, components.map((c) => c.id).join(',')],
    queryFn: async () => {
      const rows = components as ComponentRow[];
      const historyByComponent = await Promise.all(
        rows.map(async (component) => {
          const history = await componentApi.getComplianceHistory(component.id);
          return { component, history };
        }),
      );

      const mapped: ComponentApplication[] = [];
      for (const { component, history } of historyByComponent) {
        for (const record of history as ComponentComplianceRecord[]) {
          mapped.push({
            id: `api-${record.id}`,
            componentInstanceId: component.id,
            taskId: record.task.id,
            aircraftId: component.aircraftId ?? selectedAircraft,
            workRequestId: '',
            officeOrderId: '',
            workOrderNumber: record.workOrderNumber ?? '',
            appliedAt: record.performedAt,
            aircraftHoursAtApplication: record.aircraftHoursAtCompliance,
            aircraftCyclesAtApplication: record.aircraftCyclesAtCompliance,
            nextDueHours: record.nextDueHours,
            nextDueCycles: record.nextDueCycles,
            nextDueDate: record.nextDueDate,
            notes: record.notes,
            createdAt: record.performedAt,
          });
        }
      }

      return mapped;
    },
    enabled: Boolean(selectedAircraft) && components.length > 0,
    staleTime: 0,
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

  const componentById = useMemo(() => {
    const map = new Map<string, ComponentRow>();
    for (const c of components as ComponentRow[]) {
      map.set(c.id, c);
    }
    return map;
  }, [components]);

  const installedComponents = useMemo(
    () => filteredComponents.filter((c) => !removedComponentIds.includes(c.id) && !(c.position ?? '').toUpperCase().startsWith('REMOVED')),
    [filteredComponents, removedComponentIds],
  );

  const effectiveComponentApplications = useMemo(() => {
    const byKey = new Map<string, ComponentApplication>();

    for (const app of bulkComponentApplications) {
      if (selectedAircraft && app.aircraftId !== selectedAircraft) continue;
      const key = `${app.componentInstanceId}::${app.taskId}::${app.appliedAt}`;
      byKey.set(key, app);
    }

    for (const app of componentApplications) {
      if (selectedAircraft && app.aircraftId !== selectedAircraft) continue;
      const key = `${app.componentInstanceId}::${app.taskId}::${app.appliedAt}`;
      byKey.set(key, app);
    }

    return Array.from(byKey.values()).sort(
      (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
    );
  }, [bulkComponentApplications, componentApplications, selectedAircraft]);

  const latestApplicationByComponentId = useMemo(() => {
    const map = new Map<string, ComponentApplication>();
    for (const app of effectiveComponentApplications) {
      const existing = map.get(app.componentInstanceId);
      if (!existing || new Date(app.appliedAt).getTime() > new Date(existing.appliedAt).getTime()) {
        map.set(app.componentInstanceId, app);
      }
    }
    return map;
  }, [effectiveComponentApplications]);

  const currentComponentByTaskId = useMemo(() => {
    const map = new Map<string, ComponentRow>();

    const sortedApps = [...effectiveComponentApplications].sort(
      (a, b) => new Date(b.appliedAt).getTime() - new Date(a.appliedAt).getTime(),
    );

    for (const app of sortedApps) {
      if (app.aircraftId !== selectedAircraft) continue;
      if (map.has(app.taskId)) continue;
      const comp = componentById.get(app.componentInstanceId);
      if (!comp) continue;
      if ((comp.position ?? '').toUpperCase().startsWith('REMOVED')) continue;
      map.set(app.taskId, comp);
    }

    return map;
  }, [effectiveComponentApplications, componentById, selectedAircraft]);

  const taskById = useMemo(() => {
    const map = new Map<string, MaintenancePlanItem>();
    for (const t of planItems) map.set(t.taskId, t);
    return map;
  }, [planItems]);

  const componentDefinitionByTaskId = useMemo(() => {
    const map = new Map<string, ComponentDefinition>();
    const now = new Date().toISOString();

    for (const task of componentChapterTasks) {
      const intervalDays = task.intervalCalendarDays != null
        ? task.intervalCalendarDays
        : task.intervalCalendarMonths != null
          ? task.intervalCalendarMonths * 30
          : null;
      map.set(task.taskId, {
        id: task.taskId,
        ataChapter: task.taskCode.split('-')[0] ?? 'N/A',
        ataCode: task.taskCode,
        name: task.taskTitle,
        description: task.taskTitle,
        intervalType: resolveIntervalType(task),
        intervalHours: task.intervalHours,
        intervalCycles: task.intervalCycles,
        intervalDays,
        requiresComponentTracking: true,
        sourceGroup: 'MAINTENANCE_PLAN',
        reference: task.referenceNumber ?? null,
        createdAt: now,
        updatedAt: now,
      });
    }

    return map;
  }, [componentChapterTasks]);

  const workRequestRefById = useMemo(() => {
    const map = new Map<string, string>();
    for (const wr of workRequests) map.set(wr.id, wr.folio);
    return map;
  }, [workRequests]);

  const buildDueContextForComponent = (c: ComponentRow) => {
    const latestApplication = latestApplicationByComponentId.get(c.id) ?? null;
    const linkedDefinition = latestApplication
      ? componentDefinitionByTaskId.get(latestApplication.taskId) ?? null
      : null;
    const traceTask = latestApplication
      ? taskById.get(latestApplication.taskId) ?? null
      : null;

    const snapshot: AircraftSnapshot = {
      currentHours: selectedAircraftData?.totalFlightHours ?? 0,
      currentCycles: selectedAircraftData?.totalCycles ?? 0,
      currentDate: new Date().toISOString(),
    };

    const fallbackAppliedHours = snapshot.currentHours - (c.hoursSinceOverhaul ?? c.totalHoursSinceNew ?? 0);
    const fallbackAppliedCycles = snapshot.currentCycles - (c.cyclesSinceOverhaul ?? c.totalCyclesSinceNew ?? 0);
    const fallbackRemainingHours = c.tboHours != null && c.hoursSinceOverhaul != null
      ? c.tboHours - c.hoursSinceOverhaul
      : null;
    const fallbackRemainingCycles = c.tboCycles != null && c.cyclesSinceOverhaul != null
      ? c.tboCycles - c.cyclesSinceOverhaul
      : null;
    const syntheticApplication: ComponentApplication = latestApplication ?? {
      id: `synthetic-${c.id}`,
      componentInstanceId: c.id,
      taskId: traceTask?.taskId ?? c.id,
      aircraftId: c.aircraftId ?? selectedAircraft,
      workRequestId: '',
      officeOrderId: '',
      workOrderNumber: '',
      appliedAt: c.installationDate ?? new Date().toISOString(),
      aircraftHoursAtApplication: Number.isFinite(fallbackAppliedHours) ? fallbackAppliedHours : 0,
      aircraftCyclesAtApplication: Number.isFinite(fallbackAppliedCycles) ? fallbackAppliedCycles : 0,
      nextDueHours: fallbackRemainingHours != null ? snapshot.currentHours + fallbackRemainingHours : null,
      nextDueCycles: fallbackRemainingCycles != null ? snapshot.currentCycles + fallbackRemainingCycles : null,
      nextDueDate: null,
      notes: null,
      createdAt: new Date().toISOString(),
    };

    const fallbackIntervalType: ComponentDefinition['intervalType'] = c.tboHours != null && c.tboCycles != null
      ? 'mixed'
      : c.tboCycles != null
        ? 'cycles'
        : 'hours';

    const definition: ComponentDefinition = linkedDefinition ?? {
      id: `def-${c.id}`,
      ataChapter: 'N/A',
      ataCode: 'N/A',
      name: c.description,
      description: c.description,
      intervalType: fallbackIntervalType,
      intervalHours: c.tboHours ?? null,
      intervalCycles: c.tboCycles ?? null,
      intervalDays: null,
      requiresComponentTracking: true,
      sourceGroup: 'COMPONENTS_PAGE',
      reference: null,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    return {
      due: calculateComponentDue(definition, syntheticApplication, snapshot),
      latestApplication,
      traceTask,
    };
  };

  const selectedTimelineComponent = useMemo(
    () => (expandedComponentId ? (componentById.get(expandedComponentId) ?? null) : null),
    [expandedComponentId, componentById],
  );

  const selectedTimelineDue = useMemo(
    () => (selectedTimelineComponent ? buildDueContextForComponent(selectedTimelineComponent) : null),
    [selectedTimelineComponent],
  );

  const timelineEvents = useMemo(() => {
    if (!selectedTimelineComponent) return [] as TimelineEvent[];
    const componentId = selectedTimelineComponent.id;
    const events: TimelineEvent[] = [];

    if (selectedTimelineComponent.installationDate) {
      events.push({
        id: `inst-${componentId}`,
        type: 'installation',
        occurredAt: selectedTimelineComponent.installationDate,
        title: 'Componente instalado',
        details: [
          `P/N: ${selectedTimelineComponent.partNumber}`,
          `S/N: ${selectedTimelineComponent.serialNumber}`,
          `Posición: ${selectedTimelineComponent.position ?? '—'}`,
        ],
        stRef: null,
        otRef: null,
      });
    }

    for (const app of effectiveComponentApplications.filter((x) => x.componentInstanceId === componentId)) {
      const task = taskById.get(app.taskId);
      events.push({
        id: `app-${app.id}`,
        type: 'application',
        occurredAt: app.appliedAt,
        title: 'Aplicación registrada',
        details: [
          `Tarea ATA: ${task?.taskCode ?? app.taskId}`,
          `Horas/Ciclos: ${app.aircraftHoursAtApplication.toFixed(1)} / ${app.aircraftCyclesAtApplication}`,
          `Próximo: ${[
            app.nextDueHours != null ? `${app.nextDueHours.toFixed(0)} FH` : null,
            app.nextDueCycles != null ? `${app.nextDueCycles} CYC` : null,
            app.nextDueDate ? new Date(app.nextDueDate).toLocaleDateString('es-MX') : null,
          ].filter(Boolean).join(' · ') || '—'}`,
        ],
        stRef: workRequestRefById.get(app.workRequestId) ?? app.workRequestId,
        otRef: app.workOrderNumber,
      });
    }

    for (const h of componentHistory) {
      events.push({
        id: `api-app-${h.id}`,
        type: 'application',
        occurredAt: h.performedAt,
        title: 'Aplicación registrada',
        details: [
          `Tarea ATA: ${h.task.code}`,
          `Horas/Ciclos: ${h.aircraftHoursAtCompliance.toFixed(1)} / ${h.aircraftCyclesAtCompliance}`,
          `Próximo: ${[
            h.nextDueHours != null ? `${h.nextDueHours.toFixed(0)} FH` : null,
            h.nextDueCycles != null ? `${h.nextDueCycles} CYC` : null,
            h.nextDueDate ? new Date(h.nextDueDate).toLocaleDateString('es-MX') : null,
          ].filter(Boolean).join(' · ') || '—'}`,
        ],
        stRef: null,
        otRef: h.workOrderNumber,
      });
    }

    for (const move of componentMovements) {
      const touchesComponent = move.installedComponentInstanceId === componentId || move.removedComponentInstanceId === componentId;
      if (!touchesComponent) continue;

      if (move.movementType === 'replacement') {
        events.push({
          id: `repl-${move.id}`,
          type: 'replacement',
          occurredAt: move.performedAt,
          title: 'Reemplazo de componente',
          details: [
            `Saliente: ${move.removedPartNumber ?? (move.removedComponentInstanceId ? componentById.get(move.removedComponentInstanceId)?.partNumber ?? '—' : '—')} / ${move.removedSerialNumber ?? (move.removedComponentInstanceId ? componentById.get(move.removedComponentInstanceId)?.serialNumber ?? '—' : '—')}`,
            `Entrante: ${move.installedPartNumber ?? (move.installedComponentInstanceId ? componentById.get(move.installedComponentInstanceId)?.partNumber ?? '—' : '—')} / ${move.installedSerialNumber ?? (move.installedComponentInstanceId ? componentById.get(move.installedComponentInstanceId)?.serialNumber ?? '—' : '—')}`,
            `Posición: ${move.position}`,
            `Horas/Ciclos: ${move.aircraftHoursAtMovement.toFixed(1)} / ${move.aircraftCyclesAtMovement}`,
          ],
          stRef: workRequestRefById.get(move.workRequestId) ?? move.workRequestId,
          otRef: move.workOrderNumber,
        });
        continue;
      }

      if (move.movementType === 'remove' && move.removedComponentInstanceId === componentId) {
        events.push({
          id: `rem-${move.id}`,
          type: 'removal',
          occurredAt: move.performedAt,
          title: 'Componente removido',
          details: [
            `P/N: ${move.removedPartNumber ?? componentById.get(componentId)?.partNumber ?? '—'}`,
            `S/N: ${move.removedSerialNumber ?? componentById.get(componentId)?.serialNumber ?? '—'}`,
            `Posición: ${move.position}`,
            `Horas/Ciclos: ${move.aircraftHoursAtMovement.toFixed(1)} / ${move.aircraftCyclesAtMovement}`,
          ],
          stRef: workRequestRefById.get(move.workRequestId) ?? move.workRequestId,
          otRef: move.workOrderNumber,
        });
      }
    }

    const unique = new Map<string, TimelineEvent>();
    for (const ev of events) {
      const dedupeKey = `${ev.type}-${ev.occurredAt}-${ev.title}-${ev.otRef ?? ''}-${ev.stRef ?? ''}`;
      if (!unique.has(dedupeKey)) unique.set(dedupeKey, ev);
    }

    return Array.from(unique.values()).sort((a, b) => new Date(b.occurredAt).getTime() - new Date(a.occurredAt).getTime());
  }, [selectedTimelineComponent, effectiveComponentApplications, componentMovements, componentHistory, componentById, taskById, workRequestRefById]);

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

  const hasExecutionForComponentInWorkRequest = (componentId: string, workRequestId: string) => {
    const hasApplication = effectiveComponentApplications.some(
      (app) => app.workRequestId === workRequestId && app.componentInstanceId === componentId,
    );

    const hasMovement = componentMovements.some((movement) => {
      if (movement.workRequestId !== workRequestId) return false;
      return movement.removedComponentInstanceId === componentId
        || movement.installedComponentInstanceId === componentId;
    });

    return hasApplication || hasMovement;
  };

  const componentFlowById = useMemo(() => {
    const map = new Map<string, {
      openOrDraftSt: { id: string; ref: string } | null;
      validSt: { id: string; ref: string } | null;
    }>();
    for (const wr of workRequests) {
      if (wr.aircraftId !== selectedAircraft) continue;
      const hasOtEvidence = Boolean(wr.otReference && (wr.otReceivedAt || wr.returnedSignedOtUrl || wr.status === WorkRequestStatus.SIGNED_OT_RECEIVED));
      const isValid = isValidSTForExecution(wr.status, hasOtEvidence);
      const isOpen = isOpenOrDraftST(wr.status);

      if (!isValid && !isOpen) continue;
      for (const item of wr.items) {
        if (item.sourceKind !== 'component_inspection' || !item.sourceId) continue;
        const existing = map.get(item.sourceId) ?? { openOrDraftSt: null, validSt: null };
        const alreadyExecuted = hasExecutionForComponentInWorkRequest(item.sourceId, wr.id);
        if (isValid && !alreadyExecuted) existing.validSt = existing.validSt ?? { id: wr.id, ref: wr.folio };
        if (!isValid && isOpen) existing.openOrDraftSt = existing.openOrDraftSt ?? { id: wr.id, ref: wr.folio };
        map.set(item.sourceId, existing);
      }
    }
    return map;
  }, [workRequests, selectedAircraft, effectiveComponentApplications, componentMovements]);

  const openOrDraftSTByTaskId = useMemo(() => {
    const map = new Map<string, { id: string; ref: string }>();
    for (const wr of workRequests) {
      if (wr.aircraftId !== selectedAircraft) continue;
      if (!isOpenOrDraftST(wr.status)) continue;
      for (const item of wr.items) {
        if (!item.sourceId) continue;
        if (!map.has(item.sourceId)) {
          map.set(item.sourceId, { id: wr.id, ref: wr.folio });
        }
      }
    }
    return map;
  }, [workRequests, selectedAircraft]);

  const getWorkRequestRef = (workRequestId: string) => {
    const wr = useWorkRequestStore.getState().workRequests.find((x) => x.id === workRequestId);
    return wr?.folio ?? workRequestId;
  };

  const handleInlineAddComponentToST = async (component: ComponentRow) => {
    if (!component.aircraftId) {
      toast.error('El componente debe estar asociado a una aeronave para agregarlo a ST');
      return;
    }

    const stId = await createSTFromSource('component', {
      aircraftId: component.aircraftId,
      sourceId: component.id,
      ataCode: component.partNumber,
      title: component.description,
      description: 'Accion requerida',
      aircraftHoursAtRequest: selectedAircraftData?.totalFlightHours ?? 0,
      aircraftCyclesAtRequest: selectedAircraftData?.totalCycles ?? 0,
      priority: 'media',
    });

    const stRef = getWorkRequestRef(stId);
    selectWorkRequest(stId, 'general');
    toast.success(`Ítem agregado a ${stRef}`);
  };

  const handleInlineAddTaskToST = async (item: MaintenancePlanItem) => {
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

    const stRef = getWorkRequestRef(stId);
    selectWorkRequest(stId, 'general');
    toast.success(`Ítem agregado a ${stRef}`);
  };

  const handleInlineViewST = (stId: string) => {
    const exists = workRequests.some((wr) => wr.id === stId);
    if (!exists) {
      toast.error('No se encontro la ST asociada');
      return;
    }
    const stRef = getWorkRequestRef(stId);
    selectWorkRequest(stId, 'general');
    const query = selectedAircraft
      ? `/work-requests?aircraftId=${selectedAircraft}&stId=${stId}`
      : `/work-requests?stId=${stId}`;
    navigate(query);
    toast.success(`Abriendo ${stRef}`);
  };

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
              <th className="table-header">ATA</th>
              <th className="table-header">Límite</th>
              <th className="table-header">Actual</th>
              <th className="table-header">Remanente</th>
              <th className="table-header">Próximo cumplimiento</th>
              <th className="table-header">Vence el</th>
              <th className="table-header">Estado</th>
              <th className="table-header">ST</th>
              <th className="table-header text-center">Acciones</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {isLoading && <tr><td colSpan={13} className="table-cell text-center text-slate-400 py-12">Cargando…</td></tr>}
            {!isLoading && installedComponents.length === 0 && <tr><td colSpan={13} className="table-cell text-center text-slate-400 py-12">No hay componentes instalados actualmente</td></tr>}
            {installedComponents.map((c: ComponentRow) => {
              const flow = componentFlowById.get(c.id) ?? { openOrDraftSt: null, validSt: null };
              const applicationTask = filteredComponentChapterTasks.find((row) => getExecutionContextForTask(row, 'maintenance_application', c.id)) ?? null;
              const replacementTask = filteredComponentChapterTasks.find((row) => getExecutionContextForTask(row, 'component_replacement', c.id)) ?? null;
              const showExecutionActions = Boolean(flow.validSt);
              const { due, latestApplication, traceTask } = buildDueContextForComponent(c);
              const installedVisibleState: VisibleComponentState = flow.validSt
                ? 'OT recibida'
                : flow.openOrDraftSt
                  ? 'En ST'
                  : latestApplication
                    ? 'Al día / Ejecutado'
                    : traceTask?.status === 'OVERDUE' || due.status === 'critical'
                      ? 'Vencida'
                      : traceTask?.status === 'DUE_SOON' || due.status === 'warning'
                        ? 'Próx. vencer'
                        : traceTask?.status === 'NEVER_PERFORMED'
                          ? 'Sin registro'
                          : 'Al día / Ejecutado';

              return (
                <tr key={c.id} className="hover:bg-slate-50 transition-colors">
                  <td className="table-cell font-mono text-xs text-slate-700">{c.partNumber}</td>
                  <td className="table-cell font-mono text-xs text-slate-700">{c.serialNumber}</td>
                  <td className="table-cell text-slate-700">{c.description}</td>
                  <td className="table-cell text-slate-500">{c.position ?? '—'}</td>
                  <td className="table-cell text-xs text-slate-700 font-medium">{due.labels.ata}</td>
                  <td className="table-cell text-xs">{renderMetricPills(due.labels.limit, due.criticalBy)}</td>
                  <td className="table-cell text-xs">{renderMetricPills(due.labels.actual, due.criticalBy)}</td>
                  <td className="table-cell text-xs">{renderMetricPills(due.labels.remaining, due.criticalBy)}</td>
                  <td className="table-cell text-xs">{renderMetricPills(due.labels.nextDue, due.criticalBy)}</td>
                  <td className="table-cell text-xs text-slate-600">{due.labels.dueOn}</td>
                  <td className="table-cell text-xs">{visibleStateBadge(installedVisibleState)} <span className="sr-only">{due.labels.status}</span></td>
                  <td className="table-cell text-xs text-slate-600">
                    {flow.validSt ? `OT recibida/firmada ${flow.validSt.ref}` : flow.openOrDraftSt ? `En borrador ${flow.openOrDraftSt.ref}` : 'Sin ST'}
                  </td>
                  <td className="table-cell text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      <button
                        className="btn-secondary btn-xs"
                        onClick={() => setExpandedComponentId(c.id)}
                      >
                        Ver historial
                      </button>
                      {!showExecutionActions && !flow.openOrDraftSt && (
                        <button
                          className="btn-primary btn-xs"
                          onClick={() => handleInlineAddComponentToST(c)}
                        >
                          Agregar a ST
                        </button>
                      )}
                      {!showExecutionActions && flow.openOrDraftSt && (
                        <button
                          className="btn-secondary btn-xs"
                          onClick={() => handleInlineViewST(flow.openOrDraftSt!.id)}
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

      {expandedComponentId && selectedTimelineComponent && (
        <div className="fixed inset-0 z-50 bg-black/40 p-4">
          <div className="mx-auto flex h-full w-full max-w-6xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-2xl">
            <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
              <div>
                <h2 className="text-base font-bold text-slate-900">Timeline de componente</h2>
                <p className="text-xs text-slate-500 mt-0.5">Historial completo con eventos respaldados por ST/OT</p>
              </div>
              <button
                type="button"
                className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-700"
                onClick={() => setExpandedComponentId(null)}
              >
                <X size={16} />
              </button>
            </div>

            <div className="grid grid-cols-1 gap-6 overflow-y-auto p-6 lg:grid-cols-[340px,1fr]">
              <aside className="rounded-xl border border-slate-200 bg-slate-50/70 p-4">
                <h3 className="text-sm font-bold text-slate-900">Componente actual</h3>
                <div className="mt-3 space-y-2 text-xs text-slate-700">
                  <p><span className="font-semibold text-slate-500">Descripción:</span> {selectedTimelineComponent.description}</p>
                  <p><span className="font-semibold text-slate-500">P/N:</span> <span className="font-mono">{selectedTimelineComponent.partNumber}</span></p>
                  <p><span className="font-semibold text-slate-500">S/N:</span> <span className="font-mono">{selectedTimelineComponent.serialNumber}</span></p>
                  <p><span className="font-semibold text-slate-500">Posición:</span> {selectedTimelineComponent.position ?? '—'}</p>
                  <p><span className="font-semibold text-slate-500">ATA:</span> {selectedTimelineDue?.due.labels.ata ?? 'N/A'}</p>
                </div>

                <div className="mt-4 border-t border-slate-200 pt-4 space-y-2">
                  <div className="flex items-center justify-between gap-2 text-xs">
                    <span className="text-slate-500">Estado</span>
                    {(() => {
                      const flow = componentFlowById.get(selectedTimelineComponent.id) ?? { openOrDraftSt: null, validSt: null };
                      const traceStatus = selectedTimelineDue?.traceTask?.status;
                      const dueStatus = selectedTimelineDue?.due.status;
                      const hasLatest = Boolean(selectedTimelineDue?.latestApplication);
                      const visible: VisibleComponentState = flow.validSt
                        ? 'OT recibida'
                        : flow.openOrDraftSt
                          ? 'En ST'
                          : hasLatest
                            ? 'Al día / Ejecutado'
                            : traceStatus === 'OVERDUE' || dueStatus === 'critical'
                              ? 'Vencida'
                              : traceStatus === 'DUE_SOON' || dueStatus === 'warning'
                                ? 'Próx. vencer'
                                : traceStatus === 'NEVER_PERFORMED'
                                  ? 'Sin registro'
                                  : 'Al día / Ejecutado';
                      return visibleStateBadge(visible);
                    })()}
                  </div>
                  <div className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">Actual</span><div>{renderMetricPills(selectedTimelineDue?.due.labels.actual ?? [], selectedTimelineDue?.due.criticalBy ?? 'none')}</div></div>
                  <div className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">Remanente</span><div>{renderMetricPills(selectedTimelineDue?.due.labels.remaining ?? [], selectedTimelineDue?.due.criticalBy ?? 'none')}</div></div>
                  <div className="flex items-center justify-between gap-2 text-xs"><span className="text-slate-500">Próximo</span><div>{renderMetricPills(selectedTimelineDue?.due.labels.nextDue ?? [], selectedTimelineDue?.due.criticalBy ?? 'none')}</div></div>
                </div>
              </aside>

              <section>
                <h3 className="text-sm font-bold text-slate-900">Timeline operacional</h3>
                {loadingComponentHistory ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-400">Cargando timeline…</div>
                ) : timelineEvents.length === 0 ? (
                  <div className="mt-4 rounded-xl border border-slate-200 bg-white px-4 py-8 text-sm text-slate-400">Sin eventos registrados para este componente.</div>
                ) : (
                  <ol className="mt-4 space-y-4">
                    {timelineEvents.map((event, index) => {
                      const style = timelineStyle(event.type);
                      return (
                        <li key={event.id} className="relative rounded-xl border border-slate-200 bg-white p-4">
                          <div className="flex items-start gap-3">
                            <div className="relative mt-1">
                              <span className={`block h-2.5 w-2.5 rounded-full ${style.dot}`} />
                              {index < timelineEvents.length - 1 && <span className="absolute left-1.5 top-3 block h-14 w-px bg-slate-200" />}
                            </div>
                            <div className="min-w-0 flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className={`inline-flex rounded-full border px-2 py-0.5 text-[11px] font-semibold ${style.badge}`}>{style.label}</span>
                                <p className="text-sm font-semibold text-slate-900">{event.title}</p>
                                <span className="text-xs text-slate-500">{new Date(event.occurredAt).toLocaleString('es-MX')}</span>
                              </div>
                              <div className="mt-2 grid grid-cols-1 gap-1 text-xs text-slate-600 md:grid-cols-2">
                                {event.details.map((detail) => <p key={detail}>{detail}</p>)}
                              </div>
                              <div className="mt-2 flex flex-wrap items-center gap-1.5">
                                {event.stRef && <span className="inline-flex rounded-full border border-blue-200 bg-blue-50 px-2 py-0.5 text-[11px] font-semibold text-blue-700">ST {event.stRef}</span>}
                                {event.otRef && <span className="inline-flex rounded-full border border-indigo-200 bg-indigo-50 px-2 py-0.5 text-[11px] font-semibold text-indigo-700">OT {event.otRef}</span>}
                              </div>
                            </div>
                          </div>
                        </li>
                      );
                    })}
                  </ol>
                )}
              </section>
            </div>
          </div>
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
                const openSt = openOrDraftSTByTaskId.get(item.taskId) ?? null;
                const associatedComponent = currentComponentByTaskId.get(item.taskId) ?? null;
                const hasExecutedApplication = effectiveComponentApplications.some((app) => app.taskId === item.taskId && app.aircraftId === selectedAircraft);
                const taskVisibleState: VisibleComponentState = appContext || replacementContext
                  ? 'OT recibida'
                  : openSt
                    ? 'En ST'
                    : hasExecutedApplication || item.status === 'OK'
                      ? 'Al día / Ejecutado'
                      : item.status === 'OVERDUE'
                        ? 'Vencida'
                        : item.status === 'DUE_SOON'
                          ? 'Próx. vencer'
                          : 'Sin registro';

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
                  <td className="table-cell text-xs">{visibleStateBadge(taskVisibleState)}</td>
                  <td className="table-cell text-xs text-slate-600">
                    {associatedComponent
                      ? `${associatedComponent.partNumber} / ${associatedComponent.serialNumber}`
                      : 'Sin componente asociado'}
                  </td>
                  <td className="table-cell text-xs text-slate-600">{appContext || replacementContext ? 'OT recibida/firmada' : openSt ? `En borrador ${openSt.ref}` : 'Sin solicitud'}</td>
                  <td className="table-cell text-center">
                    <div className="flex items-center justify-center gap-1.5">
                      {!appContext && !replacementContext && !openSt && (
                        <button
                          className="btn-primary btn-xs"
                          onClick={() => handleInlineAddTaskToST(item)}
                        >
                          Agregar a ST
                        </button>
                      )}
                      {!appContext && !replacementContext && openSt && (
                        <button
                          className="btn-secondary btn-xs"
                          onClick={() => handleInlineViewST(openSt.id)}
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
              <th className="table-header">P/N saliente</th>
              <th className="table-header">S/N saliente</th>
              <th className="table-header">P/N entrante</th>
              <th className="table-header">S/N entrante</th>
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
                <td className="table-cell text-xs text-slate-700 font-mono">{row.removedPartNumber ?? (row.removedComponentInstanceId ? componentById.get(row.removedComponentInstanceId)?.partNumber ?? '—' : '—')}</td>
                <td className="table-cell text-xs text-slate-700 font-mono">{row.removedSerialNumber ?? (row.removedComponentInstanceId ? componentById.get(row.removedComponentInstanceId)?.serialNumber ?? '—' : '—')}</td>
                <td className="table-cell text-xs text-slate-700 font-mono">{row.installedPartNumber ?? (row.installedComponentInstanceId ? componentById.get(row.installedComponentInstanceId)?.partNumber ?? '—' : '—')}</td>
                <td className="table-cell text-xs text-slate-700 font-mono">{row.installedSerialNumber ?? (row.installedComponentInstanceId ? componentById.get(row.installedComponentInstanceId)?.serialNumber ?? '—' : '—')}</td>
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
            {effectiveComponentApplications.map((row) => (
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
